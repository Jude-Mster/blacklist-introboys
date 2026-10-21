import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, randomHex } from '../../shared/session.ts';
import { getMemberByUserId, withRecordLock, UserError, errorResponse, resilient } from '../../shared/points.ts';
import { memo, bust } from '../../shared/memo.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  WAR_MAP_IDS, MAX_SHAPES, MAX_POINTS, MAX_OPS, MAX_PAGES, MAX_PLANS, GUEST_DAYS_DEFAULT,
  cleanText, applyOps, pointCount, CODE_RE, normCode, tokenHash, memLimit, clientIp
} from '../../shared/warRoom.ts';

// 6.33: the War Room. Who may come in:
//   commanders: the Guild Leader and the Vice Guild Members (officers): everything, including new plans;
//   the council: anyone the Guild Leader invited with a code (allied guild leaders, or members): sees and
//   draws on every plan;
//   only the Guild Leader makes, lists and cancels invite codes and removes people from the council.
// Guests who aren't guild members get their own War Room pass (token) when they use a code: no Discord
// sign-in, no access to anything else on the site.

const DAY = 24 * 60 * 60 * 1000;
const PAGE_MS = 1000;   // screens watching the same page share one read for this long
const nowIso = () => new Date(Date.now()).toISOString();
const COMMAND = ['leader', 'officer'];

type Who = { level: 'command' | 'council'; name: string; leader: boolean; member?: any; guest?: any };

async function readBody(req) { try { return (await req.clone().json()) || {}; } catch { return {}; } }

const inviteRow = (b, id: string) => memo(`war:inv:${id}`, 30000, async () => {
  try { return await b.asServiceRole.entities.WarInvite.get(id); } catch { return null; }
});
const guestOk = async (b, g) => {
  if (!g || g.revoked || !(Date.parse(g.expires_at || '') > Date.now())) return false;
  const inv = g.invite_id ? await inviteRow(b, g.invite_id) : null;
  return !!(inv && !inv.revoked);
};

async function identify(b, req, p): Promise<Who | null> {
  const user = await sessionUser(b, req, 60000);
  if (user) {
    const m = await getMemberByUserId(b, user.id);
    if (m && !m.banned) {
      const name = m.discord_name || 'Member';
      if (COMMAND.includes(m.role)) return { level: 'command', name, leader: m.role === 'leader', member: m };
      // a member who was given a code
      const { items } = await b.asServiceRole.entities.WarGuest.filter({ member_id: m.id, revoked: false }, { limit: 5 });
      for (const g of items) if (await guestOk(b, g)) return { level: 'council', name, leader: false, member: m, guest: g };
    }
  }
  const t = typeof p._w === 'string' && /^[a-f0-9]{64}$/.test(p._w) ? p._w : '';
  if (t) {
    const g = await memo(`war:tok:${t.slice(0, 16)}`, 20000, async () => {
      const { items } = await b.asServiceRole.entities.WarGuest.filter({ token_hash: await tokenHash(t) }, { limit: 1 });
      return items[0] || null;
    });
    if (g && await guestOk(b, g)) return { level: 'council', name: g.name || 'Guest', leader: false, guest: g };
  }
  return null;
}

const planView = (p) => ({ id: p.id, title: p.title || 'Plan', notes: p.notes || '', by: p.created_by_name || '', at: p.created_date, updated_at: p.updated_at || p.created_date });
const pageMeta = (g) => ({ id: g.id, plan_id: g.plan_id, map: g.map, title: g.title || '', v: g.version || 0, n: (g.shapes || []).length, edited_by: g.edited_by || '', edited_at: g.edited_at || '' });
const pageView = (g) => ({ ...pageMeta(g), shapes: g.shapes || [] });
const inviteView = (i) => ({ id: i.id, code: i.code, label: i.label || '', uses: i.uses || 0, max_uses: i.max_uses || 0, access_days: i.access_days || GUEST_DAYS_DEFAULT, expires_at: i.expires_at || null, revoked: !!i.revoked, at: i.created_date });

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    const p = await readBody(req);
    const action = String(p.action || '');
    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });
    const E = b.asServiceRole.entities;

    // ---------- joining with a code (works signed in or not) ----------
    if (action === 'redeem') {
      const ip = clientIp(req);
      if (ip && !memLimit('war:redeem:' + ip, 8, 10 * 60 * 1000)) throw new UserError('Too many tries. Wait ten minutes.', 429);
      const code = normCode(p.code);
      if (!CODE_RE.test(code)) throw new UserError('That code is not right.', 404);
      const { items } = await E.WarInvite.filter({ code }, { limit: 1 });
      const inv = items[0];
      const dead = !inv || inv.revoked || (inv.expires_at && !(Date.parse(inv.expires_at) > Date.now())) || (inv.max_uses > 0 && (inv.uses || 0) >= inv.max_uses);
      if (dead) throw new UserError('That code is not right, or it has been used up.', 404);
      // A signed-in member joins as themselves; anyone else picks the name the board shows.
      const user = await sessionUser(b, req);
      const member = user ? await getMemberByUserId(b, user.id) : null;
      if (member && member.banned) throw new UserError('You are banned.', 403);
      if (member && COMMAND.includes(member.role)) return Response.json({ ok: true, already: true });
      const name = member ? (member.discord_name || 'Member') : cleanText(p.name, 24);
      if (!member && name.length < 2) throw new UserError('Type the name the others will see (2 to 24 letters).');
      return await withRecordLock(b, 'WarInvite', inv.id, async () => {
        const fresh = await E.WarInvite.get(inv.id);
        if (fresh.revoked || (fresh.max_uses > 0 && (fresh.uses || 0) >= fresh.max_uses)) throw new UserError('That code has just been used up.', 404);
        const token = randomHex(32);
        const days = fresh.access_days || GUEST_DAYS_DEFAULT;
        await E.WarGuest.create({
          invite_id: fresh.id, member_id: member ? member.id : '', discord_id: member ? String(member.discord_id || '') : '',
          name, token_hash: await tokenHash(token), expires_at: new Date(Date.now() + days * DAY).toISOString(), revoked: false, last_seen_at: nowIso()
        });
        await E.WarInvite.update(fresh.id, { uses: (fresh.uses || 0) + 1 });
        bust(`war:inv:${fresh.id}`);
        return Response.json({ ok: true, token: member ? '' : token, name, days, label: fresh.label || '' });
      });
    }

    const who = await identify(b, req, p);
    if (action === 'me') {
      return Response.json({ ok: true, access: who ? who.level : 'none', name: who ? who.name : '', leader: !!(who && who.leader), guest: !!(who && who.guest && !who.member), until: who && who.guest ? who.guest.expires_at : null });
    }
    if (!who) throw new UserError('The War Room is for the guild commanders and people they invite.', 403);
    const command = who.level === 'command';
    const mustCommand = () => { if (!command) throw new UserError('Only the Guild Leader and Vice Guild Members can do that.', 403); };
    const mustLeader = () => { if (!who.leader) throw new UserError('Only the Guild Leader can do that.', 403); };
    if (who.guest && !who.member && (!who.guest.last_seen_at || Date.now() - Date.parse(who.guest.last_seen_at) > 5 * 60000)) {
      E.WarGuest.update(who.guest.id, { last_seen_at: nowIso() }).catch(() => {});
    }

    // ---------- plans ----------
    if (action === 'plans') {
      const { items } = await E.WarPlan.filter({ archived: false }, { sort: '-updated_at', limit: MAX_PLANS });
      return Response.json({ ok: true, plans: items.map(planView), can_command: command, leader: who.leader });
    }
    if (action === 'createPlan') {
      mustCommand();
      const title = cleanText(p.title, 60) || 'HSB plan';
      const map = WAR_MAP_IDS.includes(String(p.map)) ? String(p.map) : 'z038';
      const { items } = await E.WarPlan.filter({ archived: false }, { limit: MAX_PLANS + 1 });
      if (items.length >= MAX_PLANS) throw new UserError(`At most ${MAX_PLANS} plans. Delete an old one first.`);
      const plan = await E.WarPlan.create({ title, notes: '', created_by_name: who.name, archived: false, updated_at: nowIso() });
      const page = await E.WarPage.create({ plan_id: plan.id, map, title: '', shapes: [], version: 1, edited_by: who.name, edited_at: nowIso() });
      return Response.json({ ok: true, plan: planView(plan), pages: [pageMeta(page)] });
    }
    if (action === 'updatePlan') {
      const plan = await E.WarPlan.get(String(p.id || '')).catch(() => null);
      if (!plan || plan.archived) throw new UserError('That plan is gone.', 404);
      const fields: Record<string, any> = { updated_at: nowIso() };
      if (p.title !== undefined) { mustCommand(); fields.title = cleanText(p.title, 60) || plan.title; }
      if (p.notes !== undefined) fields.notes = String(p.notes ?? '').slice(0, 2000);
      const saved = await E.WarPlan.update(plan.id, fields);
      return Response.json({ ok: true, plan: planView({ ...plan, ...saved }) });
    }
    if (action === 'deletePlan') {
      mustCommand();
      const plan = await E.WarPlan.get(String(p.id || '')).catch(() => null);
      if (!plan) throw new UserError('That plan is gone.', 404);
      await E.WarPlan.update(plan.id, { archived: true });
      return Response.json({ ok: true });
    }
    if (action === 'pages') {
      const plan = await E.WarPlan.get(String(p.planId || '')).catch(() => null);
      if (!plan || plan.archived) throw new UserError('That plan is gone.', 404);
      const { items } = await E.WarPage.filter({ plan_id: plan.id }, { sort: 'created_date', limit: MAX_PAGES });
      return Response.json({ ok: true, plan: planView(plan), pages: items.map(pageMeta) });
    }
    if (action === 'addPage') {
      const plan = await E.WarPlan.get(String(p.planId || '')).catch(() => null);
      if (!plan || plan.archived) throw new UserError('That plan is gone.', 404);
      if (!WAR_MAP_IDS.includes(String(p.map))) throw new UserError('Pick a map.');
      const { items } = await E.WarPage.filter({ plan_id: plan.id }, { limit: MAX_PAGES + 1 });
      if (items.length >= MAX_PAGES) throw new UserError(`At most ${MAX_PAGES} maps in one plan.`);
      const page = await E.WarPage.create({ plan_id: plan.id, map: String(p.map), title: cleanText(p.title, 40), shapes: [], version: 1, edited_by: who.name, edited_at: nowIso() });
      await E.WarPlan.update(plan.id, { updated_at: nowIso() }).catch(() => {});
      return Response.json({ ok: true, page: pageMeta(page) });
    }
    if (action === 'deletePage') {
      mustCommand();
      const page = await E.WarPage.get(String(p.id || '')).catch(() => null);
      if (!page) throw new UserError('That map is gone.', 404);
      const { items } = await E.WarPage.filter({ plan_id: page.plan_id }, { limit: 2 });
      if (items.length <= 1) throw new UserError('A plan keeps at least one map.');
      await E.WarPage.delete(page.id);
      bust(`war:page:${page.id}`);
      return Response.json({ ok: true });
    }

    // ---------- one board ----------
    if (action === 'page') {
      const id = String(p.id || '');
      const page = await memo(`war:page:${id}`, PAGE_MS, async () => { try { return await E.WarPage.get(id); } catch { return null; } });
      if (!page) throw new UserError('That map is gone.', 404);
      if (Number(p.v) === (page.version || 0)) return Response.json({ ok: true, same: true, v: page.version || 0 });
      return Response.json({ ok: true, page: pageView(page) });
    }
    if (action === 'edit') {
      const id = String(p.id || '');
      const ops = Array.isArray(p.ops) ? p.ops.slice(0, MAX_OPS) : [];
      if (!ops.length) throw new UserError('Nothing to save.');
      const out = await withRecordLock(b, 'WarPage', id, async () => {
        const page = await E.WarPage.get(id).catch(() => null);
        if (!page) throw new UserError('That map is gone.', 404);
        const { shapes, changed } = applyOps(page.shapes || [], ops, who.name, command);
        if (!changed) return page;
        if (shapes.length > MAX_SHAPES || pointCount(shapes) > MAX_POINTS) throw new UserError('This map is full. Erase some drawings or use another map.', 413);
        const saved = await E.WarPage.update(id, { shapes, version: (page.version || 0) + 1, edited_by: who.name, edited_at: nowIso() });
        return { ...page, ...saved, shapes };
      }, 10000, 6000);
      bust(`war:page:${id}`);
      E.WarPlan.update(out.plan_id, { updated_at: nowIso() }).catch(() => {});
      return Response.json({ ok: true, page: pageView(out) });
    }

    // ---------- the Guild Leader: invites and the council ----------
    if (action === 'invites') {
      mustLeader();
      const [{ items: inv }, { items: guests }] = await Promise.all([
        E.WarInvite.filter({}, { sort: '-created_date', limit: 100 }),
        E.WarGuest.filter({ revoked: false }, { sort: '-created_date', limit: 300 })
      ]);
      const label = new Map(inv.map((i) => [i.id, i.label || i.code]));
      return Response.json({
        ok: true, invites: inv.map(inviteView),
        council: guests.filter((g) => Date.parse(g.expires_at || '') > Date.now()).map((g) => ({ id: g.id, name: g.name, member: !!g.member_id, via: label.get(g.invite_id) || '', until: g.expires_at, last_seen_at: g.last_seen_at || null }))
      });
    }
    if (action === 'createInvite') {
      mustLeader();
      const code = normCode(p.code);
      if (!CODE_RE.test(code)) throw new UserError('Make the code 6 to 24 letters, numbers or dashes.');
      const maxUses = Number(p.maxUses ?? 0), days = Number(p.accessDays ?? GUEST_DAYS_DEFAULT), validDays = Number(p.validDays ?? 7);
      if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > 500) throw new UserError('Uses must be a whole number from 0 (no limit) to 500.');
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new UserError('Access must be 1 to 365 days.');
      if (!Number.isInteger(validDays) || validDays < 0 || validDays > 365) throw new UserError('The code can be valid for 0 (no end) to 365 days.');
      const { items } = await E.WarInvite.filter({ code }, { limit: 1 });
      if (items.length) throw new UserError('That code is already in use. Pick another.');
      const inv = await E.WarInvite.create({
        code, label: cleanText(p.label, 40), max_uses: maxUses, uses: 0, access_days: days,
        expires_at: validDays ? new Date(Date.now() + validDays * DAY).toISOString() : '', revoked: false, created_by: who.member.id
      });
      return Response.json({ ok: true, invite: inviteView(inv) });
    }
    if (action === 'revokeInvite') {
      mustLeader();
      const inv = await E.WarInvite.get(String(p.id || '')).catch(() => null);
      if (!inv) throw new UserError('That code is gone.', 404);
      await E.WarInvite.update(inv.id, { revoked: true });
      bust(`war:inv:${inv.id}`);
      return Response.json({ ok: true });
    }
    if (action === 'removeGuest') {
      mustLeader();
      const g = await E.WarGuest.get(String(p.id || '')).catch(() => null);
      if (!g) throw new UserError('Not found.', 404);
      await E.WarGuest.update(g.id, { revoked: true });
      bust('war:tok:');
      return Response.json({ ok: true });
    }
    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
