import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sessionUser, randomHex } from '../../shared/session.ts';
import { getMemberByUserId, withRecordLock, UserError, errorResponse, resilient } from '../../shared/points.ts';
import { memo, bust } from '../../shared/memo.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  WAR_MAP_IDS, MAX_SHAPES, MAX_POINTS, MAX_OPS, MAX_PAGES, MAX_PLANS, GUEST_DAYS_DEFAULT,
  cleanText, applyOps, cleanShape, pointCount, CODE_RE, normCode, tokenHash, memLimit, clientIp,
  HOME_GUILD, GUILD_COLORS, cleanGuild, cleanColor, WAR_LANGS, CHAT_MAX_LEN, CHAT_WINDOW, CHAT_GAP_MS,
  ONLINE_MS, SEEN_EVERY_MS, NOTIFY_EDIT_GAP_MS, NOTIFY_NOTES_GAP_MS
} from '../../shared/warRoom.ts';
import { decodeImage, translateAll, DEFAULT_TRANSLATE_PER_MIN } from '../../shared/buysell.ts';
import { getVapid, validSubscription, sendPush } from '../../shared/webpush.ts';

// 6.33: the War Room. Who may come in:
//   commanders: the Guild Leader and the Vice Guild Members (officers): everything, including new plans;
//   the council: anyone the Guild Leader invited with a code (allied guild leaders, or members): sees and
//   draws on every plan;
//   only the Guild Leader makes, lists and cancels invite codes and removes people from the council.
// Guests who aren't guild members get their own War Room pass (token) when they use a code: no Discord
// sign-in, no access to anything else on the site.

const DAY = 24 * 60 * 60 * 1000;
const PAGE_MS = 2500;   // screens watching the same page share one read for this long (6.43: was 1 s - the site's database budget is shared)
const nowIso = () => new Date(Date.now()).toISOString();
const COMMAND = ['leader', 'officer'];

// id: 'm_<member id>' or 'g_<guest id>' (a guest who isn't a member). guild/color: shown with the name.
type Who = { level: 'command' | 'council'; id: string; name: string; leader: boolean; guild: string; color: string; member?: any; guest?: any };

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
      if (COMMAND.includes(m.role)) return { level: 'command', id: 'm_' + m.id, name, leader: m.role === 'leader', ...HOME_GUILD, member: m };
      // a member who was given a code
      const items = await memo(`war:mg:${m.id}`, 20000, async () => (await b.asServiceRole.entities.WarGuest.filter({ member_id: m.id, revoked: false }, { limit: 5 })).items);
      for (const g of items) if (await guestOk(b, g)) return { level: 'council', id: 'm_' + m.id, name, leader: false, ...HOME_GUILD, member: m, guest: g };
    }
  }
  const t = typeof p._w === 'string' && /^[a-f0-9]{64}$/.test(p._w) ? p._w : '';
  if (t) {
    const g = await memo(`war:tok:${t.slice(0, 16)}`, 20000, async () => {
      const { items } = await b.asServiceRole.entities.WarGuest.filter({ token_hash: await tokenHash(t) }, { limit: 1 });
      return items[0] || null;
    });
    if (g && await guestOk(b, g)) return { level: 'council', id: 'g_' + g.id, name: g.name || 'Guest', leader: false, ...guildOf(g), guest: g };
  }
  return null;
}

const guildOf = (g) => ({ guild: cleanGuild(g && g.guild) || 'Allies', color: cleanColor(g && g.color) });
const planView = (p) => ({ id: p.id, title: p.title || 'Plan', notes: p.notes || '', by: p.created_by_name || '', at: p.created_date, updated_at: p.updated_at || p.created_date, updated_by: p.updated_by || '' });
const pageMeta = (g) => ({ id: g.id, plan_id: g.plan_id, map: g.map, title: g.title || '', v: g.version || 0, n: (g.shapes || []).length, edited_by: g.edited_by || '', edited_at: g.edited_at || '' });
const pageView = (g) => ({ ...pageMeta(g), shapes: g.shapes || [] });
const inviteView = (i) => ({ id: i.id, code: i.code, label: i.label || '', ...guildOf(i), uses: i.uses || 0, max_uses: i.max_uses || 0, access_days: i.access_days || GUEST_DAYS_DEFAULT, expires_at: i.expires_at || null, revoked: !!i.revoked, at: i.created_date });

// ---------- 6.34 helpers ----------
const MAP_NAMES: Record<string, string> = {
  z001: 'Piercing City', z002: 'Crystal Waters', z003: 'Bamboo Crane Woods', z004: 'Fragrance Village',
  z006: 'Wandering City', z007: 'Evergreen Waterfall', z008: 'Frozen Valley', z009: 'Holy Valley',
  z011: 'Molten City', z012: 'Burning Woods', z013: 'Forlorn Land', z014: 'Sundrenched Valley',
  z038: 'Ghost Valley', z074: 'Temple of the Benevolent'
};
// Chat text keeps its line breaks (orders are often a list), nothing else.
const cleanChat = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, CHAT_MAX_LEN);

const chatView = (m) => ({
  id: m.id, who: m.who, name: m.name || '', guild: m.guild || HOME_GUILD.guild, color: m.color || HOME_GUILD.color, level: m.level || 'council',
  text: m.removed ? '' : (m.text || ''), lang: m.lang || '', tr: m.removed ? null : (m.tr || null), image: m.removed ? '' : (m.image_url || ''),
  removed: !!m.removed, at: m.created_date
});
// ---------- 6.39: the board, one row per drawing ----------
const pageRow = (b, id: string) => memo(`war:pg:${id}`, 30000, async () => { try { return await b.asServiceRole.entities.WarPage.get(id); } catch { return null; } });
const planRow = (b, id: string) => memo(`war:pl:${id}`, 30000, async () => { try { return await b.asServiceRole.entities.WarPlan.get(id); } catch { return null; } });
// Boards drawn before 6.39 kept every drawing inside the page: moved into rows once, the first time the board is opened.
async function migrateBoard(b, page) {
  if (!page || !Array.isArray(page.shapes) || !page.shapes.length) return;
  const E = b.asServiceRole.entities;
  await withRecordLock(b, 'WarPage', page.id, async () => {
    const fresh = await E.WarPage.get(page.id).catch(() => null);
    if (!fresh || !Array.isArray(fresh.shapes) || !fresh.shapes.length) return;
    const { items } = await E.WarShape.filter({ page_id: page.id }, { limit: 3000 });
    const have = new Set(items.map((r) => r.sid));
    const t = Date.now();
    await runLimited(fresh.shapes.filter((sh) => sh && sh.id && !have.has(sh.id)).map((sh) => () => E.WarShape.create({ page_id: page.id, sid: sh.id, data: sh, by: sh.by || '', t })), 6);
    await E.WarPage.update(page.id, { shapes: [] });
  }, 60000, 20000);
  page.shapes = [];
  bust(`war:pg:${page.id}`);
}
// What a board holds now. Every screen watching it shares one read a second. v changes whenever anything was
// drawn, moved or erased (count + newest change), so a screen with nothing new is told "same" and no drawings.
const boardState = (b, id: string) => memo(`war:board:${id}`, PAGE_MS, async () => {
  const page = await pageRow(b, id);
  if (!page) return null;
  await migrateBoard(b, page);
  const { items } = await b.asServiceRole.entities.WarShape.filter({ page_id: id }, { limit: 3000 });
  return boardOf(page, items);
});
function boardOf(page, rows) {
  let newest = null;
  for (const r of rows) if (!newest || (r.t || 0) > (newest.t || 0)) newest = r;
  return { page, rows, v: `${rows.length}.${newest ? newest.t || 0 : 0}`, last: newest ? newest.cby || newest.by || '' : '' };
}
const boardView = (st) => ({
  id: st.page.id, plan_id: st.page.plan_id, map: st.page.map, title: st.page.title || '', v: st.v, n: st.rows.length,
  edited_by: st.last || st.page.edited_by || '', shapes: st.rows.map((r) => (r.data ? { ...r.data, by: r.data.by || r.by || '' } : null)).filter(Boolean)
});
async function runLimited(jobs: (() => Promise<any>)[], n: number) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const j = jobs[i++]; await j(); } }));
}
// A plan's "last changed" is written at most once a minute per plan (it only orders the list and marks "new").
const touched = new Map<string, number>();
async function touchPlan(b, planId: string, by: string) {
  if (!planId || Date.now() - (touched.get(planId) || 0) < 60_000) return;
  touched.set(planId, Date.now());
  if (touched.size > 2000) touched.clear();
  await b.asServiceRole.entities.WarPlan.update(planId, { updated_at: nowIso(), updated_by: by }).catch(() => {});
  bust('war:plans');
}
async function chatSince(b, after, trSince) {
  const rows = await chatWindow(b);
  const at = after ? rows.findIndex((m) => m.id === String(after)) : -1;
  const fresh = at >= 0 ? rows.slice(at + 1) : rows;
  const since = Date.parse(String(trSince || '')) || 0;
  const old = at >= 0 ? rows.slice(0, at + 1) : [];
  const updates = since ? old.filter((m) => (Date.parse(m.tr_at || '') || 0) > since) : [];
  return { messages: fresh.map(chatView), updates: updates.map(chatView), now: nowIso() };
}

// Every screen asks for the same newest messages: one database read every 2.5 s, however many are watching.
const chatWindow = (b) => memo('war:chat', 2500, async () => {      // 6.43: was 1 s
  const { items } = await b.asServiceRole.entities.WarChat.filter({}, { sort: '-created_date', limit: CHAT_WINDOW });
  return items.reverse();
});

// "Still here", written at most every 45 seconds per person per running copy. 6.35: awaited: Base44 stops a
// function once it has answered, so a write left running after the answer was never saved.
const seenAt = new Map<string, number>();
async function seen(b, who: Who) {
  const last = seenAt.get(who.id) || 0;
  if (Date.now() - last < SEEN_EVERY_MS) return;
  seenAt.set(who.id, Date.now());
  if (seenAt.size > 5000) seenAt.clear();
  try {
    const E = b.asServiceRole.entities.WarSeen;
    const { items } = await E.filter({ who: who.id }, { limit: 2 });
    if (items[0]) await E.update(items[0].id, { at: nowIso(), name: who.name });
    else { await E.create({ who: who.id, name: who.name, at: nowIso() }); bust('war:roster'); }
  } catch { seenAt.delete(who.id); }
}

// Everyone allowed in, grouped by guild (the home guild first), with who is online now.
async function people(b) {
  const E = b.asServiceRole.entities;
  const [{ items: leaders }, { items: officers }, { items: guests }, { items: seenRows }] = await Promise.all([
    E.Member.filter({ role: 'leader' }, { limit: 20 }),
    E.Member.filter({ role: 'officer' }, { limit: 100 }),
    E.WarGuest.filter({ revoked: false }, { limit: 500 }),
    E.WarSeen.filter({}, { sort: '-at', limit: 600 })
  ]);
  const last = new Map(seenRows.map((s) => [s.who, Date.parse(s.at || '') || 0]));
  const list = [];
  const ids = new Set();
  for (const m of [...leaders, ...officers]) {
    if (m.banned || !COMMAND.includes(m.role)) continue;
    ids.add('m_' + m.id);
    list.push({ id: 'm_' + m.id, name: m.discord_name || 'Member', role: m.role, ...HOME_GUILD });
  }
  for (const g of guests) {
    if (!(await guestOk(b, g))) continue;
    const id = g.member_id ? 'm_' + g.member_id : 'g_' + g.id;
    if (ids.has(id)) continue;
    ids.add(id);
    list.push({ id, name: g.name || 'Guest', role: g.member_id ? 'member' : 'guest', ...(g.member_id ? HOME_GUILD : guildOf(g)) });
  }
  return list.map((x) => ({ ...x, seen: last.get(x.id) || 0 }));
}
const roster = (b) => memo('war:roster', 5000, async () => {
  const now = Date.now();
  const groups = new Map<string, any>();
  for (const x of await people(b)) {
    const key = x.guild.toLowerCase();
    if (!groups.has(key)) groups.set(key, { guild: x.guild, color: x.color, home: x.guild === HOME_GUILD.guild, people: [] });
    groups.get(key).people.push({ id: x.id, name: x.name, role: x.role, online: now - x.seen < ONLINE_MS });
  }
  const rank = { leader: 0, officer: 1, member: 2, guest: 3 };
  return [...groups.values()]
    .map((g) => ({ ...g, online: g.people.filter((x) => x.online).length, people: g.people.sort((a, c) => Number(c.online) - Number(a.online) || rank[a.role] - rank[c.role] || a.name.localeCompare(c.name)) }))
    .sort((a, c) => Number(c.home) - Number(a.home) || a.guild.localeCompare(c.guild));
});

// Tell everyone in the War Room (on the phones and browsers that switched plan alerts on) that a plan
// changed. New plans always; orders at most every 2 minutes per plan; drawings at most every 10 minutes per
// plan, so a busy board doesn't buzz phones all evening. The person who made the change isn't told.
const notifiedAt = new Map<string, number>();
async function notify(b, who: Who, plan, body: string, kind: 'new' | 'notes' | 'map' | 'edit') {
  try {
    const gap = kind === 'edit' ? NOTIFY_EDIT_GAP_MS : kind === 'notes' ? NOTIFY_NOTES_GAP_MS : 0;
    const key = `${plan.id}:${kind === 'map' ? 'edit' : kind}`;
    if (gap) {
      const last = Math.max(notifiedAt.get(key) || 0, kind === 'edit' ? Date.parse(plan.notified_at || '') || 0 : 0);
      if (Date.now() - last < gap) return 0;
    }
    notifiedAt.set(key, Date.now());
    if (notifiedAt.size > 5000) notifiedAt.clear();
    const E = b.asServiceRole.entities;
    if (kind === 'edit' || kind === 'map') await E.WarPlan.update(plan.id, { notified_at: nowIso() }).catch(() => {});
    const subs = await memo('war:push', 30000, async () => (await E.WarPush.filter({}, { limit: 1000 })).items);
    const targets = subs.filter((s) => s.who && s.who !== who.id);
    if (!targets.length) return 0;
    const allowed = new Set((await people(b)).map((x) => x.id));
    let sent = 0;
    await Promise.race([
      Promise.all(targets.filter((s) => allowed.has(s.who)).map(async (s) => {
        const url = (s.who.startsWith('g_') ? '/war' : '/warroom') + `?plan=${plan.id}`;
        const code = await sendPush(b, s, { title: `War Room: ${plan.title || 'Plan'}`, body: cleanText(body, 140), tag: `war-plan-${plan.id}`, url, kind: 'hsb' }, { ttl: 6 * 3600 });
        if (code >= 200 && code < 300) { sent++; if (s.fails) await E.WarPush.update(s.id, { fails: 0 }).catch(() => {}); }
        else if (code === 404 || code === 410) await E.WarPush.delete(s.id).catch(() => {});
        else { const f = (Number(s.fails) || 0) + 1; if (f >= 20) await E.WarPush.delete(s.id).catch(() => {}); else await E.WarPush.update(s.id, { fails: f }).catch(() => {}); }
      })),
      new Promise((r) => setTimeout(r, 6000))
    ]);
    return sent;
  } catch (e) {
    console.log('war notify skipped', String(e && (e as any).message || e));
    return 0;
  }
}

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
          name, token_hash: await tokenHash(token), expires_at: new Date(Date.now() + days * DAY).toISOString(), revoked: false, last_seen_at: nowIso(),
          // guild members keep the guild's own name and colour; everyone else gets the code's
          ...(member ? { guild: '', color: '' } : guildOf(fresh))
        });
        bust('war:roster'); bust('war:mg:');
        await E.WarInvite.update(fresh.id, { uses: (fresh.uses || 0) + 1 });
        bust(`war:inv:${fresh.id}`);
        return Response.json({ ok: true, token: member ? '' : token, name, days, label: fresh.label || '', ...(member ? HOME_GUILD : guildOf(fresh)) });
      });
    }

    const who = await identify(b, req, p);
    if (action === 'me') {
      if (who) await seen(b, who);
      return Response.json({
        ok: true, access: who ? who.level : 'none', name: who ? who.name : '', id: who ? who.id : '', guild: who ? who.guild : '', color: who ? who.color : '',
        leader: !!(who && who.leader), guest: !!(who && who.guest && !who.member), until: who && who.guest ? who.guest.expires_at : null
      });
    }
    if (!who) throw new UserError('The War Room is for the guild commanders and people they invite.', 403);
    const command = who.level === 'command';
    const mustCommand = () => { if (!command) throw new UserError('Only the Guild Leader and Vice Guild Members can do that.', 403); };
    const mustLeader = () => { if (!who.leader) throw new UserError('Only the Guild Leader can do that.', 403); };
    if (who.guest && !who.member && (!who.guest.last_seen_at || Date.now() - Date.parse(who.guest.last_seen_at) > 5 * 60000)) {
      await E.WarGuest.update(who.guest.id, { last_seen_at: nowIso() }).catch(() => {});
    }
    await seen(b, who);

    // ---------- plans ----------
    if (action === 'plans') {
      const items = await memo('war:plans', 4000, async () => (await E.WarPlan.filter({ archived: false }, { sort: '-updated_at', limit: MAX_PLANS })).items);
      return Response.json({ ok: true, plans: items.map(planView), can_command: command, leader: who.leader });
    }
    if (action === 'createPlan') {
      mustCommand();
      const title = cleanText(p.title, 60) || 'HSB plan';
      const map = WAR_MAP_IDS.includes(String(p.map)) ? String(p.map) : 'z038';
      const { items } = await E.WarPlan.filter({ archived: false }, { limit: MAX_PLANS + 1 });
      if (items.length >= MAX_PLANS) throw new UserError(`At most ${MAX_PLANS} plans. Delete an old one first.`);
      const plan = await E.WarPlan.create({ title, notes: '', created_by_name: who.name, archived: false, updated_at: nowIso() });
      bust('war:plans');
      const page = await E.WarPage.create({ plan_id: plan.id, map, title: '', shapes: [], version: 1, edited_by: who.name, edited_at: nowIso() });
      await notify(b, who, plan, `New battle plan from ${who.name}: ${title}`, 'new');
      return Response.json({ ok: true, plan: planView(plan), pages: [pageMeta(page)] });
    }
    if (action === 'updatePlan') {
      const plan = await E.WarPlan.get(String(p.id || '')).catch(() => null);
      if (!plan || plan.archived) throw new UserError('That plan is gone.', 404);
      const fields: Record<string, any> = { updated_at: nowIso(), updated_by: who.name };
      if (p.title !== undefined) { mustCommand(); fields.title = cleanText(p.title, 60) || plan.title; }
      if (p.notes !== undefined) fields.notes = String(p.notes ?? '').slice(0, 2000);
      const saved = await E.WarPlan.update(plan.id, fields);
      bust('war:plans'); bust(`war:pl:${plan.id}`);
      if (p.notes !== undefined && String(p.notes ?? '').trim() && fields.notes !== (plan.notes || '')) {
        await notify(b, who, plan, `${who.name} changed the orders: ${cleanText(fields.notes, 90)}`, 'notes');
      }
      return Response.json({ ok: true, plan: planView({ ...plan, ...saved }) });
    }
    if (action === 'deletePlan') {
      mustCommand();
      const plan = await E.WarPlan.get(String(p.id || '')).catch(() => null);
      if (!plan) throw new UserError('That plan is gone.', 404);
      await E.WarPlan.update(plan.id, { archived: true });
      bust('war:plans'); bust(`war:pl:${plan.id}`);
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
      await E.WarPlan.update(plan.id, { updated_at: nowIso(), updated_by: who.name }).catch(() => {});
      bust('war:plans');
      await notify(b, who, plan, `${who.name} added a map: ${MAP_NAMES[String(p.map)] || 'a map'}`, 'map');
      return Response.json({ ok: true, page: pageMeta(page) });
    }
    if (action === 'deletePage') {
      mustCommand();
      const page = await E.WarPage.get(String(p.id || '')).catch(() => null);
      if (!page) throw new UserError('That map is gone.', 404);
      const { items } = await E.WarPage.filter({ plan_id: page.plan_id }, { limit: 2 });
      if (items.length <= 1) throw new UserError('A plan keeps at least one map.');
      await E.WarPage.delete(page.id);
      bust(`war:pg:${page.id}`); bust(`war:board:${page.id}`);
      const { items: drawn } = await E.WarShape.filter({ page_id: page.id }, { limit: 3000 });
      await runLimited(drawn.map((r) => () => E.WarShape.delete(r.id).catch(() => {})), 6);
      return Response.json({ ok: true });
    }

    // ---------- one board ----------
    if (action === 'page') {
      const id = String(p.id || '');
      const st = await boardState(b, id);
      if (!st) throw new UserError('That map is gone.', 404);
      if (String(p.v) === st.v) return Response.json({ ok: true, same: true, v: st.v });
      return Response.json({ ok: true, page: boardView(st) });
    }
    // 6.39: one call for everything a War Room screen keeps fresh (the open map and the chat), instead of two
    // that each ran every second or two.
    if (action === 'sync') {
      const out: Record<string, any> = { ok: true, now: nowIso() };
      if (p.page) {
        const st = await boardState(b, String(p.page));
        out.page = !st ? { gone: true } : String(p.v) === st.v ? { same: true, v: st.v } : boardView(st);
      }
      if (p.chat) out.chat = await chatSince(b, p.chatAfter, p.trSince);
      return Response.json(out);
    }
    if (action === 'edit') {
      // 6.39: no lock. Every drawing is its own row, so people drawing at the same moment never wait for each
      // other (the lock was ~10 database calls a stroke, and queuing for it is what made the War Room "busy").
      const id = String(p.id || '');
      const ops = Array.isArray(p.ops) ? p.ops.slice(0, MAX_OPS) : [];
      if (!ops.length) throw new UserError('Nothing to save.');
      const page = await pageRow(b, id);
      if (!page) throw new UserError('That map is gone.', 404);
      await migrateBoard(b, page);
      const S = E.WarShape;
      const { items: rows } = await S.filter({ page_id: id }, { limit: 3000 });
      const bySid = new Map(rows.map((r) => [r.sid, r]));
      let shapes = rows.map((r) => r.data).filter(Boolean);
      const jobs: (() => Promise<any>)[] = [];
      let added = 0;
      for (const o of ops) {
        if (!o || typeof o !== 'object') continue;
        if (o.op === 'add') {
          const sh = cleanShape(o.shape, who.name);
          if (!sh || bySid.has(sh.id)) continue;
          if (shapes.length + 1 > MAX_SHAPES || pointCount(shapes) + (sh.t === 'path' ? sh.pts.length : 4) > MAX_POINTS) throw new UserError('This map is full. Erase some drawings or use another map.', 413);
          const row = { page_id: id, sid: sh.id, data: sh, by: who.name, cby: who.name, t: Date.now() };
          bySid.set(sh.id, row); shapes.push(sh); added++;
          jobs.push(() => S.create(row));
        } else if (o.op === 'move') {
          const r = bySid.get(String(o.id));
          if (!r || !r.id) continue;
          const moved = applyOps([r.data], [o], who.name, false).shapes[0];
          if (!moved || moved === r.data) continue;
          r.data = moved; r.t = Date.now(); r.cby = who.name; shapes = shapes.map((x) => (x.id === moved.id ? moved : x));
          jobs.push(() => S.update(r.id, { data: moved, t: r.t, cby: who.name }));
        } else if (o.op === 'remove') {
          for (const sid of (Array.isArray(o.ids) ? o.ids : [o.id]).map(String)) {
            const r = bySid.get(sid);
            if (!r) continue;
            bySid.delete(sid); shapes = shapes.filter((x) => x.id !== sid);
            if (r.id) jobs.push(() => S.delete(r.id).catch(() => {}));
          }
        } else if (o.op === 'clear' && command) {
          for (const r of bySid.values()) if (r.id) jobs.push(() => S.delete(r.id).catch(() => {}));
          bySid.clear(); shapes = [];
        }
      }
      await runLimited(jobs, 6);
      bust(`war:board:${id}`);
      if (jobs.length) {
        await touchPlan(b, page.plan_id, who.name);
        if (added) {
          const plan = await planRow(b, page.plan_id);
          if (plan) await notify(b, who, plan, `${who.name} is drawing on ${MAP_NAMES[page.map] || 'the map'}`, 'edit');
        }
      }
      // the answer is built from what was just written (no second read)
      return Response.json({ ok: true, page: boardView(boardOf(page, [...bySid.values()])) });
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
        council: guests.filter((g) => Date.parse(g.expires_at || '') > Date.now()).map((g) => ({ id: g.id, name: g.name, member: !!g.member_id, ...(g.member_id ? HOME_GUILD : guildOf(g)), via: label.get(g.invite_id) || '', until: g.expires_at, last_seen_at: g.last_seen_at || null })),
        colors: GUILD_COLORS
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
        code, label: cleanText(p.label, 40), guild: cleanGuild(p.guild) || 'Allies', color: cleanColor(p.color), max_uses: maxUses, uses: 0, access_days: days,
        expires_at: validDays ? new Date(Date.now() + validDays * DAY).toISOString() : '', revoked: false, created_by: who.member.id
      });
      return Response.json({ ok: true, invite: inviteView(inv) });
    }
    if (action === 'updateInvite') {
      // 6.34: change a code's guild name or colour; everyone who joined with it changes too.
      mustLeader();
      const inv = await E.WarInvite.get(String(p.id || '')).catch(() => null);
      if (!inv) throw new UserError('That code is gone.', 404);
      const fields: Record<string, any> = {};
      if (p.guild !== undefined) fields.guild = cleanGuild(p.guild) || 'Allies';
      if (p.color !== undefined) fields.color = cleanColor(p.color);
      if (p.label !== undefined) fields.label = cleanText(p.label, 40);
      const saved = await E.WarInvite.update(inv.id, fields);
      if (fields.guild || fields.color) {
        const { items } = await E.WarGuest.filter({ invite_id: inv.id }, { limit: 500 });
        const g = guildOf({ ...inv, ...saved });
        await Promise.all(items.filter((x) => !x.member_id).map((x) => E.WarGuest.update(x.id, g).catch(() => {})));
      }
      bust(`war:inv:${inv.id}`); bust('war:tok:'); bust('war:mg:'); bust('war:roster');
      return Response.json({ ok: true, invite: inviteView({ ...inv, ...saved }) });
    }
    if (action === 'revokeInvite') {
      mustLeader();
      const inv = await E.WarInvite.get(String(p.id || '')).catch(() => null);
      if (!inv) throw new UserError('That code is gone.', 404);
      await E.WarInvite.update(inv.id, { revoked: true });
      bust(`war:inv:${inv.id}`); bust('war:roster'); bust('war:mg:');
      return Response.json({ ok: true });
    }
    if (action === 'removeGuest') {
      mustLeader();
      const g = await E.WarGuest.get(String(p.id || '')).catch(() => null);
      if (!g) throw new UserError('Not found.', 404);
      await E.WarGuest.update(g.id, { revoked: true });
      bust('war:tok:'); bust('war:mg:'); bust('war:roster');
      return Response.json({ ok: true });
    }
    // ---------- 6.34: who is in the War Room, by guild ----------
    if (action === 'roster') {
      return Response.json({ ok: true, guilds: await roster(b) });
    }

    // ---------- 6.34: the War Room chat ----------
    if (action === 'chat') {
      return Response.json({ ok: true, ...(await chatSince(b, p.after, p.trSince)) });
    }
    if (action === 'chatSend') {
      const text = cleanChat(p.text);
      const image = typeof p.image === 'string' && p.image ? p.image : '';
      if (!text && !image) throw new UserError('Type a message first.');
      if (!memLimit('war:chat1:' + who.id, 1, CHAT_GAP_MS) || !memLimit('war:chat60:' + who.id, 40, 60000)) throw new UserError('Slow down a little.', 429);
      let imageUrl = '';
      if (image) {
        let img;
        try { img = decodeImage(image); } catch (e) {
          throw new UserError(String(e && (e as any).message) === 'too-big' ? 'Pictures can be up to 10 MB.' : 'That file is not a picture (JPG, PNG, WebP or GIF).');
        }
        const res: any = await b.asServiceRole.integrations.Core.UploadFile({ file: new File([img.bytes], `warroom-${Date.now()}.${img.ext}`, { type: img.type }) });
        imageUrl = String((res && (res.file_url || (res.data && res.data.file_url))) || '');
        if (!/^https:\/\//.test(imageUrl)) throw new UserError('The picture could not be uploaded. Try again.', 502);
      }
      // Posted straight away; the sender's screen then asks for the translations ('chatTranslate').
      const m = await E.WarChat.create({ who: who.id, name: who.name, guild: who.guild, color: who.color, level: who.level, text, lang: '', tr: null, tr_at: '', image_url: imageUrl, removed: false });
      bust('war:chat');
      return Response.json({ ok: true, message: chatView(m) });
    }
    if (action === 'chatTranslate') {
      const m = await E.WarChat.get(String(p.id || '')).catch(() => null);
      if (!m || m.who !== who.id) throw new UserError('Message not found.', 404);
      if (m.tr || m.tr_at || !m.text || m.removed) return Response.json({ ok: true, message: chatView(m) });
      const t = await translateAll(b, m.text, DEFAULT_TRANSLATE_PER_MIN, 8000, {
        langs: WAR_LANGS, maxLen: CHAT_MAX_LEN,
        about: 'short chat messages between guild leaders planning a Holy Stone Battle (HSB) in the online game Twelve Sky 2 (server "Wuxen2")',
        keep: 'Keep player names, guild names, map names, team letters (A, B, C), times, numbers and game words (HSB, GvG, PK, buff, tank, healer, stone, gate, outpost, rally) exactly as written.'
      });
      // tr_at is set even when nothing came back, so a message is never translated twice.
      const saved = await E.WarChat.update(m.id, { lang: t.lang, tr: t.tr, tr_at: nowIso() });
      bust('war:chat');
      return Response.json({ ok: true, message: chatView({ ...m, ...saved }) });
    }
    if (action === 'chatRemove') {
      const m = await E.WarChat.get(String(p.id || '')).catch(() => null);
      if (!m) throw new UserError('Message not found.', 404);
      if (m.who !== who.id && !command) throw new UserError('You can only remove your own messages.', 403);
      await E.WarChat.update(m.id, { removed: true, text: '', tr: null, image_url: '', tr_at: nowIso() });
      bust('war:chat');
      return Response.json({ ok: true });
    }

    // ---------- 6.34: notifications when a plan changes ----------
    if (action === 'pushKey') return Response.json({ ok: true, public_key: (await getVapid(b)).publicKey });
    if (action === 'pushOn') {
      if (!validSubscription(p.sub)) throw new UserError('This device gave an address we cannot send to.');
      const endpoint = String(p.sub.endpoint);
      const fields = { who: who.id, endpoint, p256dh: p.sub.keys.p256dh, auth: p.sub.keys.auth, fails: 0, device: cleanText(p.device, 60) };
      const { items: same } = await E.WarPush.filter({ endpoint }, { limit: 5 });
      bust('war:push');
      if (same.length) { await E.WarPush.update(same[0].id, fields); await Promise.all(same.slice(1).map((x) => E.WarPush.delete(x.id).catch(() => {}))); }
      else await E.WarPush.create(fields);
      const { items: all } = await E.WarPush.filter({ who: who.id }, { sort: 'created_date', limit: 50 });
      if (all.length > 8) await Promise.all(all.filter((x) => x.endpoint !== endpoint).slice(0, all.length - 8).map((x) => E.WarPush.delete(x.id).catch(() => {})));
      return Response.json({ ok: true });
    }
    if (action === 'pushOff') {
      const { items } = await E.WarPush.filter({ endpoint: String(p.endpoint || '') }, { limit: 5 });
      await Promise.all(items.filter((x) => x.who === who.id).map((x) => E.WarPush.delete(x.id).catch(() => {})));
      bust('war:push');
      return Response.json({ ok: true });
    }
    if (action === 'pushStatus') {
      const { items } = await E.WarPush.filter({ endpoint: String(p.endpoint || '') }, { limit: 5 });
      return Response.json({ ok: true, on: items.some((x) => x.who === who.id) });
    }
    if (action === 'pushTest') {
      const { items } = await E.WarPush.filter({ endpoint: String(p.endpoint || '') }, { limit: 5 });
      const s = items.find((x) => x.who === who.id);
      if (!s) return Response.json({ ok: true, status: 'missing' });
      const code = await sendPush(b, s, { title: 'War Room', body: 'Plan notifications are working on this device.', tag: 'war-test', url: who.guest && !who.member ? '/war' : '/warroom', kind: 'hsb' }, { ttl: 120 });
      if (code === 404 || code === 410) await E.WarPush.delete(s.id).catch(() => {});
      return Response.json({ ok: true, status: code >= 200 && code < 300 ? 'sent' : (code === 404 || code === 410) ? 'expired' : 'failed' });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
