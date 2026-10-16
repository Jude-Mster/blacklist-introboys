import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { sessionUser, POLL_REUSE_MS } from '../../shared/session.ts';
import { getSettings, getMemberByUserId, UserError, errorResponse, resilient, withRecordLock } from '../../shared/points.ts';
import { memo, bust } from '../../shared/memo.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  MAX_LEN, SEND_GAP_MS, PUBLIC_WINDOW, DM_WINDOW, HIDE_AFTER_REPORTS,
  blockedReason, cleanText, nameProblem, anonVid, tagOf, pairOf, decodeImage, publicView, dmView,
  translateAll, DEFAULT_TRANSLATE_PER_MIN, ipAllowed, gapLeft, noteSend, clientIp
} from '../../shared/buysell.ts';

// 6.25: Wuxen2 Buy and Sell. One function for the whole open chat (see shared/buysell.ts for how
// visitors are identified and why a poll costs no per-visitor database read).
//
// Anyone may call it, signed in or not. Signing in to the chat by linking Discord only lets a visitor
// pick a name: it never creates a guild session and never opens the members portal.

const DISCORD_API = 'https://discord.com/api/v10';
const READ_MS = 2500;          // every screen shares one read of the newest messages for this long
const USER_MS = 30000;
const VID_RE = /^[a-f0-9]{24}$/;
const MEMBER_VID_RE = /^m_[A-Za-z0-9_-]{1,64}$/;

function secret(name: string) {
  try { const v = secrets.get(name); return v ? String(v).trim() : ''; } catch { return ''; }
}

const perMinute = (s) => {
  const n = Number(s && s.buysell_translate_per_min);
  return Number.isFinite(n) && s.buysell_translate_per_min !== '' && s.buysell_translate_per_min != null ? n : DEFAULT_TRANSLATE_PER_MIN;
};

type Who = { vid: string; kind: 'member' | 'anon'; member?: any; hash?: string };

async function identify(b, req, p, poll: boolean): Promise<Who | null> {
  const user = await sessionUser(b, req, poll ? POLL_REUSE_MS : 0);
  if (user) {
    const m = await getMemberByUserId(b, user.id);
    if (m) return { vid: `m_${m.id}`, kind: 'member', member: m };
  }
  const a = await anonVid(p._a);
  return a ? { vid: a.vid, kind: 'anon', hash: a.hash } : null;
}

const userRow = (b, vid: string) => memo(`bsu:${vid}`, USER_MS, async () => {
  const { items } = await b.asServiceRole.entities.BuySellUser.filter({ vid }, { limit: 1 });
  return items[0] || null;
});

// How a visitor appears on a message.
function face(who: Who, row) {
  if (who.kind === 'member') {
    const m = who.member;
    return { name: m.discord_name || 'Member', tag: '', kind: 'member', role: m.role || 'member' };
  }
  const named = row && row.discord_id && row.name;
  return { name: named ? row.name : '', tag: tagOf(who.vid), kind: named ? 'discord' : 'anon', role: '' };
}

function meView(who: Who, row) {
  const f = face(who, row);
  const mod = who.kind === 'member' && ['officer', 'leader'].includes(who.member.role);
  return {
    vid: who.vid, ...f,
    discord: who.kind === 'anon' && row && row.discord_id ? (row.discord_name || 'Discord') : '',
    banned: !!(row && row.banned),
    moderator: mod
  };
}

// The newest open messages and private messages, shared by everyone asking within READ_MS.
const openWindow = (b) => memo('bs:pub', READ_MS, async () => {
  const { items } = await b.asServiceRole.entities.BuySellMessage.filter({ hidden: false }, { sort: '-created_date', limit: PUBLIC_WINDOW });
  return items.map(publicView).reverse();
});
const dmWindow = (b) => memo('bs:dm', READ_MS, async () => {
  const { items } = await b.asServiceRole.entities.BuySellDM.filter({ hidden: false }, { sort: '-created_date', limit: DM_WINDOW });
  return items.map(dmView).reverse();
});

async function recipient(b, vid: string) {
  if (MEMBER_VID_RE.test(vid)) {
    let m = null;
    try { m = await b.asServiceRole.entities.Member.get(vid.slice(2)); } catch { m = null; }
    if (!m || m.no_access) throw new UserError('That member is not available.', 404);
    return { name: m.discord_name || 'Member', tag: '', kind: 'member' };
  }
  if (!VID_RE.test(vid)) throw new UserError('Pick who to message.');
  const row = await userRow(b, vid);
  const named = row && row.discord_id && row.name;
  return { name: named ? row.name : '', tag: tagOf(vid), kind: named ? 'discord' : 'anon' };
}

async function uploadImage(b, dataUrl: string) {
  let img;
  try { img = decodeImage(dataUrl); } catch (e) {
    throw new UserError(String(e && (e as any).message) === 'too-big' ? 'Pictures can be up to 3 MB.' : 'That file is not a picture (JPG, PNG, WebP or GIF).');
  }
  const file = new File([img.bytes], `wuxen2-${Date.now()}.${img.ext}`, { type: img.type });
  const res: any = await b.asServiceRole.integrations.Core.UploadFile({ file });
  const url = res && (res.file_url || (res.data && res.data.file_url));
  if (!url || !/^https:\/\//.test(String(url))) throw new UserError('The picture could not be uploaded. Try again.', 502);
  return String(url);
}

function mustModerate(who: Who | null) {
  if (!who || who.kind !== 'member' || !['officer', 'leader'].includes(who.member.role)) {
    throw new UserError('Only the Guild Leader and Vice Guild Members can do that.', 403);
  }
}

export default async function(req) {
  try {
    const b = resilient(createClientFromRequest(req));
    // Read the body from a copy: sessionUser() reads the member's `_s` token from the request body itself.
    let p; try { p = await req.clone().json(); } catch { p = {}; }
    const action = String(p.action || 'poll');
    if (action === 'ping') return Response.json({ ok: true, version: BACKEND_VERSION });

    const settings = await getSettings(b);
    const off = settings.buysell_enabled === false;
    const poll = action === 'poll';
    const who = await identify(b, req, p, poll);
    if (!who) throw new UserError('Reload the page to join the chat.', 401);

    // ----- Reading -----
    if (poll) {
      if (off) return Response.json({ ok: true, off: true, items: [], dms: [] });
      const since = typeof p.since === 'string' ? p.since : '';
      const dmSince = typeof p.dmSince === 'string' ? p.dmSince : '';
      const [open, dms] = await Promise.all([p.lite ? Promise.resolve([]) : openWindow(b), dmWindow(b)]);
      const mine = dms.filter((d) => (d.from === who.vid || d.to === who.vid) && (!dmSince || d.at > dmSince));
      const items = since ? open.filter((m) => m.at > since) : open;
      return Response.json({ ok: true, items, dms: mine, vid: who.vid });
    }

    if (action === 'hello') {
      const row = who.kind === 'anon' ? await userRow(b, who.vid) : null;
      return Response.json({ ok: true, off, me: meView(who, row) });
    }

    // Older private messages (when the chat opens): the caller's own conversations only.
    if (action === 'inbox') {
      const D = b.asServiceRole.entities.BuySellDM;
      const [a, c] = await Promise.all([
        D.filter({ from_vid: who.vid }, { sort: '-created_date', limit: 100 }),
        D.filter({ to_vid: who.vid }, { sort: '-created_date', limit: 100 })
      ]);
      const all = [...a.items, ...c.items].filter((d) => !d.hidden).map(dmView).sort((x, y) => (x.at < y.at ? -1 : 1));
      return Response.json({ ok: true, dms: all });
    }

    // ----- Sending -----
    if (action === 'send') {
      if (off) throw new UserError('Buy and Sell is closed right now.');
      const text = cleanText(p.text);
      const image = typeof p.image === 'string' && p.image ? p.image : '';
      if (!text && !image) throw new UserError('Type a message first.');
      if (text.length > MAX_LEN) throw new UserError(`Keep messages under ${MAX_LEN} characters.`);
      const blocked = blockedReason(text);
      if (blocked) throw new UserError(blocked);
      const to = typeof p.to === 'string' ? p.to.trim() : '';
      if (to && to === who.vid) throw new UserError("You can't message yourself.");

      if (gapLeft(who.vid) > 0) throw new UserError('Slow down a little: one message every 3 seconds.', 429);
      if (!ipAllowed(clientIp(req))) throw new UserError('Too many messages from your connection. Wait a minute.', 429);

      let row = null;
      if (who.kind === 'member') {
        if (who.member.banned) throw new UserError("You can't chat while banned.", 403);
      } else {
        row = await userRow(b, who.vid);
        if (row && row.banned) throw new UserError('You have been removed from Buy and Sell.', 403);
      }
      // The same check against the database, so other running copies are covered too.
      const E = to ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
      const { items: last } = await E.filter(to ? { from_vid: who.vid } : { author_vid: who.vid }, { sort: '-created_date', limit: 1, fields: ['created_date'] });
      if (last[0] && Date.now() - Date.parse(last[0].created_date) < SEND_GAP_MS) throw new UserError('Slow down a little: one message every 3 seconds.', 429);
      noteSend(who.vid);

      const target = to ? await recipient(b, to) : null;
      if (who.kind === 'anon' && !row) {
        row = await b.asServiceRole.entities.BuySellUser.create({ vid: who.vid, tag: tagOf(who.vid), name: '', name_lower: '', discord_id: '', discord_name: '', banned: false });
        bust(`bsu:${who.vid}`);
      }
      const f = face(who, row);
      const [imageUrl, t] = await Promise.all([
        image ? uploadImage(b, image) : Promise.resolve(''),
        text ? translateAll(b, text, perMinute(settings)) : Promise.resolve({ lang: '', tr: null })
      ]);

      if (target) {
        const dm = await b.asServiceRole.entities.BuySellDM.create({
          from_vid: who.vid, to_vid: to, pair: pairOf(who.vid, to),
          from_name: f.name, from_tag: f.tag, from_kind: f.kind,
          to_name: target.name, to_tag: target.tag, to_kind: target.kind,
          text, lang: t.lang, tr: t.tr, image_url: imageUrl, hidden: false
        });
        bust('bs:dm');
        return Response.json({ ok: true, dm: dmView(dm) });
      }
      const msg = await b.asServiceRole.entities.BuySellMessage.create({
        author_vid: who.vid, name: f.name, tag: f.tag, kind: f.kind, role: f.role,
        text, lang: t.lang, tr: t.tr, image_url: imageUrl, hidden: false, reporters: []
      });
      bust('bs:pub');
      return Response.json({ ok: true, message: publicView(msg) });
    }

    // ----- Safety -----
    if (action === 'report') {
      const id = String(p.id || '');
      const where = p.where === 'private' ? 'private' : 'open';
      const E = where === 'private' ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
      const m = await E.get(id).catch(() => null);
      if (!m) throw new UserError('Message not found.', 404);
      const author = where === 'private' ? m.from_vid : m.author_vid;
      if (where === 'private' && m.from_vid !== who.vid && m.to_vid !== who.vid) throw new UserError('Message not found.', 404);
      if (author === who.vid) throw new UserError("You can't report your own message.");
      if (where === 'open') {
        const reporters = Array.isArray(m.reporters) ? m.reporters : [];
        if (!reporters.includes(who.vid)) {
          const next = [...reporters, who.vid].slice(-20);
          const hide = next.length >= HIDE_AFTER_REPORTS;
          await E.update(m.id, { reporters: next, ...(hide ? { hidden: true } : {}) });
          if (hide) bust('bs:pub');
        }
      }
      await b.asServiceRole.entities.BuySellReport.create({ message_id: m.id, where, reporter_vid: who.vid, author_vid: author, text: m.text || '', image_url: m.image_url || '' });
      return Response.json({ ok: true });
    }

    if (action === 'remove') {
      mustModerate(who);
      const where = p.where === 'private' ? 'private' : 'open';
      const E = where === 'private' ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
      const m = await E.get(String(p.id || '')).catch(() => null);
      if (!m) throw new UserError('Message not found.', 404);
      await E.update(m.id, { hidden: true });
      bust(where === 'private' ? 'bs:dm' : 'bs:pub');
      return Response.json({ ok: true });
    }

    if (action === 'ban') {
      mustModerate(who);
      const vid = String(p.vid || '');
      if (!VID_RE.test(vid)) throw new UserError('Only anonymous visitors can be removed here.');
      const U = b.asServiceRole.entities.BuySellUser;
      const { items } = await U.filter({ vid }, { limit: 1 });
      if (items[0]) await U.update(items[0].id, { banned: true, banned_by: who.member.id });
      else await U.create({ vid, tag: tagOf(vid), name: '', name_lower: '', discord_id: '', discord_name: '', banned: true, banned_by: who.member.id });
      bust(`bsu:${vid}`);
      // Hide what they posted recently.
      const { items: theirs } = await b.asServiceRole.entities.BuySellMessage.filter({ author_vid: vid, hidden: false }, { sort: '-created_date', limit: 50 });
      for (const m of theirs) await b.asServiceRole.entities.BuySellMessage.update(m.id, { hidden: true }).catch(() => {});
      bust('bs:pub');
      return Response.json({ ok: true, hidden: theirs.length });
    }

    // ----- A name, by linking Discord (optional) -----
    if (action === 'rename') {
      if (who.kind !== 'anon') throw new UserError('Members post under their guild name.');
      const U = b.asServiceRole.entities.BuySellUser;
      const { items } = await U.filter({ vid: who.vid }, { limit: 1 });
      const row = items[0];
      if (!row || !row.discord_id) throw new UserError('Link your Discord first to pick a name.', 403);
      const name = cleanText(p.name);
      if (!name) {   // back to Anonymous
        await U.update(row.id, { name: '', name_lower: '' });
        bust(`bsu:${who.vid}`);
        return Response.json({ ok: true, me: meView(who, { ...row, name: '' }) });
      }
      const problem = nameProblem(name);
      if (problem) throw new UserError(problem);
      const lower = name.toLowerCase();
      await withRecordLock(b, 'BuySellName', lower, async () => {
        const { items: taken } = await U.filter({ name_lower: lower }, { limit: 2 });
        if (taken.some((x) => x.vid !== who.vid)) throw new UserError('That name is taken. Pick another.');
        const { items: members } = await b.asServiceRole.entities.Member.filter({ discord_name: name }, { limit: 1 });
        if (members.length) throw new UserError('That name belongs to a guild member. Pick another.');
        await U.update(row.id, { name, name_lower: lower });
      }, 10000, 8000);
      bust(`bsu:${who.vid}`);
      return Response.json({ ok: true, me: meView(who, { ...row, name, name_lower: lower }) });
    }

    if (action === 'unlink') {
      if (who.kind !== 'anon') throw new UserError('Nothing to unlink.');
      const U = b.asServiceRole.entities.BuySellUser;
      const { items } = await U.filter({ vid: who.vid }, { limit: 1 });
      if (items[0]) await U.update(items[0].id, { name: '', name_lower: '', discord_id: '', discord_name: '' });
      bust(`bsu:${who.vid}`);
      return Response.json({ ok: true, me: meView(who, null) });
    }

    if (action === 'linkStart') {
      if (who.kind !== 'anon') throw new UserError('Members post under their guild name.');
      const clientId = secret('DISCORD_CLIENT_ID');
      const redirectUri = secret('DISCORD_REDIRECT_URI');
      if (!clientId || !redirectUri) throw new UserError("Discord linking isn't set up yet.", 503);
      const state = `bs_${crypto.randomUUID()}`;
      await b.asServiceRole.entities.OAuthState.create({ state, nonce_hash: who.hash, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'identify', state });
      return Response.json({ ok: true, url: `https://discord.com/oauth2/authorize?${q.toString()}` });
    }

    if (action === 'linkFinish') {
      if (who.kind !== 'anon') throw new UserError('Members post under their guild name.');
      const code = String(p.code || '').trim();
      const state = String(p.state || '').trim();
      if (!code || code.length > 200 || !/^bs_[0-9a-f-]{36}$/.test(state)) throw new UserError('That Discord link has expired. Try again.');
      const O = b.asServiceRole.entities.OAuthState;
      const { items } = await O.filter({ state }, { limit: 1 });
      const st = items[0];
      // Only the browser that started the link may finish it, once, within 10 minutes.
      if (!st || st.nonce_hash !== who.hash || st.consumed_at || !st.expires_at || Date.parse(st.expires_at) < Date.now()) {
        throw new UserError('That Discord link has expired. Try again.');
      }
      await O.update(st.id, { consumed_at: new Date().toISOString(), result: 'buysell' });
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: secret('DISCORD_CLIENT_ID'), client_secret: secret('DISCORD_CLIENT_SECRET'),
          grant_type: 'authorization_code', code, redirect_uri: secret('DISCORD_REDIRECT_URI')
        })
      });
      if (!tokenRes.ok) { console.log('buysell link: token exchange failed', tokenRes.status); throw new UserError('Discord did not confirm the link. Try again.'); }
      const { access_token: accessToken } = await tokenRes.json();
      const meRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!meRes.ok) throw new UserError('Discord did not confirm the link. Try again.');
      const du = await meRes.json();
      if (!du || !du.id) throw new UserError('Discord did not confirm the link. Try again.');
      const discordName = String(du.global_name || du.username || 'Discord').slice(0, 40);

      const U = b.asServiceRole.entities.BuySellUser;
      // One Discord account keeps one chat name: an older link from another browser is let go.
      const { items: older } = await U.filter({ discord_id: String(du.id) }, { limit: 5 });
      const { items: mine } = await U.filter({ vid: who.vid }, { limit: 1 });
      let row = mine[0];
      const carried = older.find((x) => x.vid !== who.vid && x.name);
      for (const x of older) if (x.vid !== who.vid) { await U.update(x.id, { discord_id: '', discord_name: '', name: '', name_lower: '' }); bust(`bsu:${x.vid}`); }
      const fields = { discord_id: String(du.id), discord_name: discordName, ...(carried && !(row && row.name) ? { name: carried.name, name_lower: carried.name_lower } : {}) };
      if (row) row = await U.update(row.id, fields);
      else row = await U.create({ vid: who.vid, tag: tagOf(who.vid), name: '', name_lower: '', banned: false, ...fields });
      bust(`bsu:${who.vid}`);
      const suggest = !nameProblem(String(du.username || '')) ? String(du.username) : '';
      return Response.json({ ok: true, me: meView(who, row), suggest });
    }

    throw new UserError('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
