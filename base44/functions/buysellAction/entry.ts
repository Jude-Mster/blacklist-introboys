import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { sessionUser, POLL_REUSE_MS } from '../../shared/session.ts';
import { getSettings, getMemberByUserId, UserError, errorResponse, resilient, withRecordLock } from '../../shared/points.ts';
import { memo, bust } from '../../shared/memo.ts';
import { BACKEND_VERSION } from '../../shared/version.ts';
import {
  MAX_LEN, SEND_GAP_MS, PUBLIC_WINDOW, DM_WINDOW, HIDE_AFTER_REPORTS,
  blockedReason, cleanText, nameProblem, anonVid, sha256Hex, tagOf, bucketOf, pulse, discordAvatar, safeAvatar, pairOf, decodeImage, publicView, dmView,
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

// 6.27: everyone also has a second id (`alias`) used while they hide their name, so what they post hidden
// can't be matched to their named posts. A visitor's alias comes from their own secret (no database read);
// a member's is a random id kept on their BuySellUser row. `vids` = every id the caller owns.
type Who = { vid: string; kind: 'member' | 'anon'; member?: any; hash?: string; alias: string; vids: string[]; row?: any };

async function identify(b, req, p, poll: boolean): Promise<Who | null> {
  const user = await sessionUser(b, req, poll ? POLL_REUSE_MS : 0);
  if (user) {
    const m = await getMemberByUserId(b, user.id);
    if (m) {
      const vid = `m_${m.id}`;
      const row = await userRow(b, vid);
      const alias = row && VID_RE.test(String(row.alias_vid || '')) ? row.alias_vid : '';
      return { vid, kind: 'member', member: m, alias, vids: alias ? [vid, alias] : [vid], row };
    }
  }
  const a = await anonVid(p._a);
  if (!a) return null;
  const alias = (await sha256Hex('wxh:' + a.hash)).slice(0, 24);
  return { vid: a.vid, kind: 'anon', hash: a.hash, alias, vids: [a.vid, alias] };
}

const userRow = (b, vid: string) => memo(`bsu:${vid}`, USER_MS, async () => {
  const { items } = await b.asServiceRole.entities.BuySellUser.filter({ vid }, { limit: 1 });
  return items[0] || null;
});

// Linked to Discord: a member always is; a visitor once they linked.
function linkedOf(who: Who, row) {
  if (who.kind === 'member') return { id: String(who.member.discord_id || ''), name: who.member.discord_name || '', username: who.member.discord_username || '' };
  return row && row.discord_id ? { id: String(row.discord_id), name: row.discord_name || '', username: row.discord_username || '' } : null;
}
const isHidden = (who: Who, row) => !!(row && row.hide_name && linkedOf(who, row) && who.alias);

// How someone appears on a message. asAlias: posting under the hidden id.
const discordShown = (row) => String(row.discord_username || row.discord_name || '').slice(0, 40);

function face(who: Who, row, asAlias = isHidden(who, row)) {
  if (asAlias && who.alias) return { vid: who.alias, name: '', tag: tagOf(who.alias), kind: 'anon', role: '', avatar: '' };
  if (who.kind === 'member') {
    const m = who.member;
    return { vid: who.vid, name: m.discord_name || 'Member', tag: '', kind: 'member', role: m.role || 'member', avatar: safeAvatar(m.avatar_url) };
  }
  // 6.29: linked = shown by their Discord username (unique on Discord and really theirs), with the Discord
  // badge and picture. Hidden (above) = Anonymous with no picture.
  if (row && row.discord_id) return { vid: who.vid, name: discordShown(row), tag: tagOf(who.vid), kind: 'discord', role: '', avatar: safeAvatar(row.discord_avatar) };
  return { vid: who.vid, name: '', tag: tagOf(who.vid), kind: 'anon', role: '', avatar: '' };
}

function meView(who: Who, row) {
  const f = face(who, row);
  const shown = face(who, row, false);
  const link = linkedOf(who, row);
  return {
    ...f,
    vids: who.vids,
    alias: who.alias,
    discord: link ? (link.name || link.username || 'Discord') : '',
    hidden: isHidden(who, row),
    shownAs: { name: shown.name, tag: shown.tag, kind: shown.kind, avatar: shown.avatar },   // how they look with their name showing
    discordUser: link ? link.username : '',
    discordAvatar: who.kind === 'member' ? safeAvatar(who.member.avatar_url) : safeAvatar(row && row.discord_avatar),
    member: who.kind === 'member',
    banned: !!(row && row.banned),
    moderator: who.kind === 'member' && ['officer', 'leader'].includes(who.member.role)
  };
}

// The newest open messages and private messages, shared by everyone asking within READ_MS.
// Each carries the time the read STARTED: a translation saved after that is sure to be in the next read.
// 6.28: after = the time of a change a screen was just told about: an answer read before it is read again.
const fresh = (after: string) => (v) => !after || v.at > after;
const openWindow = (b, after = '') => memo('bs:pub', READ_MS, async () => {
  const at = new Date().toISOString();
  const { items } = await b.asServiceRole.entities.BuySellMessage.filter({ hidden: false }, { sort: '-created_date', limit: PUBLIC_WINDOW });
  return { at, items: items.map(publicView).reverse() };
}, fresh(after));
const dmWindow = (b, after = '') => memo('bs:dm', READ_MS, async () => {
  const at = new Date().toISOString();
  const { items } = await b.asServiceRole.entities.BuySellDM.filter({ hidden: false }, { sort: '-created_date', limit: DM_WINDOW });
  return { at, items: items.map(dmView).reverse() };
}, fresh(after));

async function recipient(b, vid: string) {
  if (MEMBER_VID_RE.test(vid)) {
    let m = null;
    try { m = await b.asServiceRole.entities.Member.get(vid.slice(2)); } catch { m = null; }
    if (!m || m.no_access) throw new UserError('That member is not available.', 404);
    return { name: m.discord_name || 'Member', tag: '', kind: 'member', avatar: safeAvatar(m.avatar_url) };
  }
  if (!VID_RE.test(vid)) throw new UserError('Pick who to message.');
  const row = await userRow(b, vid);
  if (row && row.discord_id && !row.hide_name) return { name: discordShown(row), tag: tagOf(vid), kind: 'discord', avatar: safeAvatar(row.discord_avatar) };
  return { name: '', tag: tagOf(vid), kind: 'anon', avatar: '' };
}

async function uploadImage(b, dataUrl: string) {
  let img;
  try { img = decodeImage(dataUrl); } catch (e) {
    throw new UserError(String(e && (e as any).message) === 'too-big' ? 'Pictures can be up to 10 MB.' : 'That file is not a picture (JPG, PNG, WebP or GIF).');
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
    // Reading and translating never touch points, so they may reuse a member row read a moment ago.
    const who = await identify(b, req, p, poll || action === 'translate');
    if (!who) throw new UserError('Reload the page to join the chat.', 401);

    // ----- Reading -----
    if (poll) {
      if (off) return Response.json({ ok: true, off: true, items: [], dms: [] });
      const since = typeof p.since === 'string' ? p.since : '';
      const dmSince = typeof p.dmSince === 'string' ? p.dmSince : '';
      // 6.26: trSince = the `now` of the caller's last poll: messages translated since then come again
      // (with their translations) even though they aren't new.
      const trSince = typeof p.trSince === 'string' ? p.trSince : '';
      const after = typeof p.after === 'string' && p.after.length < 40 ? p.after : '';
      const [open, dms] = await Promise.all([p.lite ? Promise.resolve(null) : openWindow(b, after), dmWindow(b, after)]);
      const isNew = (x, cursor) => !cursor || x.at > cursor || (!!trSince && !!x.tr_at && x.tr_at > trSince);
      const mine = dms.items.filter((d) => (who.vids.includes(d.from) || who.vids.includes(d.to)) && isNew(d, dmSince));
      const items = open ? open.items.filter((m) => isNew(m, since)) : [];
      const now = open && open.at < dms.at ? open.at : dms.at;
      return Response.json({ ok: true, items, dms: mine, vids: who.vids, now });
    }

    if (action === 'hello') {
      const row = who.kind === 'anon' ? await userRow(b, who.vid) : who.row;
      return Response.json({ ok: true, off, me: meView(who, row) });
    }

    // Older private messages (when the chat opens): the caller's own conversations only.
    if (action === 'inbox') {
      const D = b.asServiceRole.entities.BuySellDM;
      const lists = await Promise.all(who.vids.flatMap((v) => [
        D.filter({ from_vid: v }, { sort: '-created_date', limit: 100 }),
        D.filter({ to_vid: v }, { sort: '-created_date', limit: 100 })
      ]));
      const byId = new Map();
      for (const l of lists) for (const d of l.items) if (!d.hidden) byId.set(d.id, d);
      const all = [...byId.values()].map(dmView).sort((x, y) => (x.at < y.at ? -1 : 1));
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
      if (to && who.vids.includes(to)) throw new UserError("You can't message yourself.");

      if (gapLeft(who.vid) > 0) throw new UserError('Slow down a little: one message every 3 seconds.', 429);
      if (!ipAllowed(clientIp(req))) throw new UserError('Too many messages from your connection. Wait a minute.', 429);

      let row = who.kind === 'member' ? who.row : await userRow(b, who.vid);
      if (who.kind === 'member' && who.member.banned) throw new UserError("You can't chat while banned.", 403);
      if (row && row.banned) throw new UserError('You have been removed from Buy and Sell.', 403);
      // Which of my ids this goes out under: the hidden one while hiding; in a private chat the screen may
      // ask for the id that conversation already uses, so it stays one conversation.
      const asAlias = to && typeof p.from === 'string' && who.vids.includes(p.from) ? p.from === who.alias : isHidden(who, row);
      const f = face(who, row, asAlias);
      // The same check against the database, so other running copies are covered too.
      const E = to ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
      const { items: last } = await E.filter({ owner_vid: who.vid }, { sort: '-created_date', limit: 1, fields: ['created_date'] });
      if (last[0] && Date.now() - Date.parse(last[0].created_date) < SEND_GAP_MS) throw new UserError('Slow down a little: one message every 3 seconds.', 429);
      noteSend(who.vid);

      const target = to ? await recipient(b, to) : null;
      if (who.kind === 'anon' && !row) {
        row = await b.asServiceRole.entities.BuySellUser.create({ vid: who.vid, tag: tagOf(who.vid), name: '', name_lower: '', discord_id: '', discord_name: '', banned: false });
        bust(`bsu:${who.vid}`);
      }
      // 6.26: posted straight away, untranslated; the sender's screen asks for the translation next
      // (action 'translate'), so nobody waits for the translator.
      const imageUrl = image ? await uploadImage(b, image) : '';
      const t = { lang: '', tr: null };

      if (target) {
        const dm = await b.asServiceRole.entities.BuySellDM.create({
          from_vid: f.vid, to_vid: to, pair: pairOf(f.vid, to), owner_vid: who.vid,
          from_name: f.name, from_tag: f.tag, from_kind: f.kind, from_avatar: f.avatar,
          to_name: target.name, to_tag: target.tag, to_kind: target.kind, to_avatar: target.avatar,
          text, lang: t.lang, tr: t.tr, image_url: imageUrl, hidden: false
        });
        bust('bs:dm');
        await pulse(b, `dm:${bucketOf(to)}`, {});
        return Response.json({ ok: true, dm: dmView(dm) });
      }
      const msg = await b.asServiceRole.entities.BuySellMessage.create({
        author_vid: f.vid, owner_vid: who.vid, name: f.name, tag: f.tag, kind: f.kind, role: f.role, avatar: f.avatar,
        text, lang: t.lang, tr: t.tr, image_url: imageUrl, hidden: false, reporters: []
      });
      bust('bs:pub');
      await pulse(b, 'open', { op: 'msg', msg: publicView(msg) });
      return Response.json({ ok: true, message: publicView(msg) });
    }

    // 6.26: translate a message just sent. Only its author may ask, and only once.
    if (action === 'translate') {
      const where = p.where === 'private' ? 'private' : 'open';
      const E = where === 'private' ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
      const m = await E.get(String(p.id || '')).catch(() => null);
      if (!m) throw new UserError('Message not found.', 404);
      const author = where === 'private' ? m.from_vid : m.author_vid;
      if (!who.vids.includes(author)) throw new UserError('Message not found.', 404);
      const view = where === 'private' ? dmView : publicView;
      if (m.tr || m.tr_at || !m.text) return Response.json({ ok: true, message: view(m) });
      const t = await translateAll(b, m.text, perMinute(settings));
      // tr_at is set even when nothing came back, so the message is never sent to the translator twice.
      const saved = await E.update(m.id, { lang: t.lang, tr: t.tr, tr_at: new Date().toISOString() });
      bust(where === 'private' ? 'bs:dm' : 'bs:pub');
      const out = view({ ...m, ...saved });
      if (where === 'private') await pulse(b, `dm:${bucketOf(m.to_vid)}`, {});
      else await pulse(b, 'open', { op: 'msg', msg: out });
      return Response.json({ ok: true, message: out });
    }

    // ----- Safety -----
    if (action === 'report') {
      const id = String(p.id || '');
      const where = p.where === 'private' ? 'private' : 'open';
      const E = where === 'private' ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
      const m = await E.get(id).catch(() => null);
      if (!m) throw new UserError('Message not found.', 404);
      const author = where === 'private' ? m.from_vid : m.author_vid;
      if (where === 'private' && !who.vids.includes(m.from_vid) && !who.vids.includes(m.to_vid)) throw new UserError('Message not found.', 404);
      if (who.vids.includes(author)) throw new UserError("You can't report your own message.");
      if (where === 'open') {
        const reporters = Array.isArray(m.reporters) ? m.reporters : [];
        if (!reporters.includes(who.vid)) {
          const next = [...reporters, who.vid].slice(-20);
          const hide = next.length >= HIDE_AFTER_REPORTS;
          await E.update(m.id, { reporters: next, ...(hide ? { hidden: true } : {}) });
          if (hide) { bust('bs:pub'); await pulse(b, 'open', { op: 'gone', ids: [m.id] }); }
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
      if (where === 'open') await pulse(b, 'open', { op: 'gone', ids: [m.id] });
      return Response.json({ ok: true });
    }

    // 6.28: officers can check that live updates reach browsers (touches only the 'test' pulse row).
    if (action === 'pulseTest') {
      mustModerate(who);
      const at = await pulse(b, 'test', { op: 'test' });
      return Response.json({ ok: !!at, at });
    }

    // Ban the person behind a message. A hidden name is banned too: the ban goes on whoever owns the message.
    if (action === 'ban') {
      mustModerate(who);
      let owner = '';
      if (p.id) {
        const E = p.where === 'private' ? b.asServiceRole.entities.BuySellDM : b.asServiceRole.entities.BuySellMessage;
        const m = await E.get(String(p.id)).catch(() => null);
        if (!m) throw new UserError('Message not found.', 404);
        owner = String(m.owner_vid || m.author_vid || m.from_vid || '');
      } else owner = String(p.vid || '');
      if (MEMBER_VID_RE.test(owner)) throw new UserError('That is a guild member. Handle it in the guild instead.');
      if (!VID_RE.test(owner)) throw new UserError('Only anonymous visitors can be removed here.');
      const U = b.asServiceRole.entities.BuySellUser;
      const { items } = await U.filter({ vid: owner }, { limit: 1 });
      if (items[0]) await U.update(items[0].id, { banned: true, banned_by: who.member.id });
      else await U.create({ vid: owner, tag: tagOf(owner), name: '', name_lower: '', discord_id: '', discord_name: '', banned: true, banned_by: who.member.id });
      bust(`bsu:${owner}`);
      // Hide what they posted recently (named or hidden).
      const M = b.asServiceRole.entities.BuySellMessage;
      const [x, y] = await Promise.all([
        M.filter({ owner_vid: owner, hidden: false }, { sort: '-created_date', limit: 50 }),
        M.filter({ author_vid: owner, hidden: false }, { sort: '-created_date', limit: 50 })
      ]);
      const theirs = new Map([...x.items, ...y.items].map((m) => [m.id, m]));
      for (const m of theirs.values()) await M.update(m.id, { hidden: true }).catch(() => {});
      bust('bs:pub');
      if (theirs.size) await pulse(b, 'open', { op: 'gone', ids: [...theirs.keys()].slice(0, 50) });
      return Response.json({ ok: true, hidden: theirs.size, vids: [...new Set([...theirs.values()].map((m) => m.author_vid))] });
    }

    // ----- 6.27: show or hide my name (Discord-linked visitors and members) -----
    if (action === 'setHidden') {
      const U = b.asServiceRole.entities.BuySellUser;
      const { items } = await U.filter({ vid: who.vid }, { limit: 1 });
      let row = items[0];
      if (!linkedOf(who, row)) throw new UserError('Link your Discord first.', 403);
      const fields: Record<string, any> = { hide_name: p.hide === true };
      if (who.kind === 'member' && !(row && VID_RE.test(String(row.alias_vid || '')))) {
        const a = new Uint8Array(12); crypto.getRandomValues(a);
        fields.alias_vid = Array.from(a).map((x) => x.toString(16).padStart(2, '0')).join('');
      }
      if (row) row = await U.update(row.id, fields);
      else row = await U.create({ vid: who.vid, tag: who.kind === 'member' ? '' : tagOf(who.vid), name: '', name_lower: '', discord_id: '', discord_name: '', banned: false, ...fields });
      bust(`bsu:${who.vid}`);
      const next = who.kind === 'member' && row.alias_vid ? { ...who, alias: row.alias_vid, vids: [who.vid, row.alias_vid] } : who;
      return Response.json({ ok: true, me: meView(next, row) });
    }

    // ----- 6.27: send my Discord to the other person in a private chat -----
    // The only way a Discord link can be sent: the server makes it from the account the sender really linked.
    if (action === 'shareDiscord') {
      if (off) throw new UserError('Buy and Sell is closed right now.');
      const to = typeof p.to === 'string' ? p.to.trim() : '';
      if (!to || who.vids.includes(to)) throw new UserError('Open a private chat first.');
      const row = who.kind === 'member' ? who.row : await userRow(b, who.vid);
      if (row && row.banned) throw new UserError('You have been removed from Buy and Sell.', 403);
      const link = linkedOf(who, row);
      if (!link || !/^\d{5,25}$/.test(link.id)) throw new UserError('Link your Discord first.', 403);
      if (gapLeft(who.vid) > 0) throw new UserError('Slow down a little: one message every 3 seconds.', 429);
      noteSend(who.vid);
      const target = await recipient(b, to);
      const asAlias = typeof p.from === 'string' && who.vids.includes(p.from) ? p.from === who.alias : isHidden(who, row);
      const f = face(who, row, asAlias);
      const dm = await b.asServiceRole.entities.BuySellDM.create({
        from_vid: f.vid, to_vid: to, pair: pairOf(f.vid, to), owner_vid: who.vid,
        from_name: f.name, from_tag: f.tag, from_kind: f.kind, from_avatar: f.avatar,
        to_name: target.name, to_tag: target.tag, to_kind: target.kind, to_avatar: target.avatar,
        text: '', lang: '', tr: null, image_url: '', hidden: false,
        card_discord_id: link.id, card_discord_name: String(link.name || link.username).slice(0, 40), card_discord_username: String(link.username || '').slice(0, 40)
      });
      bust('bs:dm');
      await pulse(b, `dm:${bucketOf(to)}`, {});
      return Response.json({ ok: true, dm: dmView(dm) });
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
      if (items[0]) await U.update(items[0].id, { name: '', name_lower: '', discord_id: '', discord_name: '', discord_username: '', discord_avatar: '', hide_name: false });
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
      if (!st || st.consumed_at || !st.expires_at || Date.parse(st.expires_at) < Date.now()) throw new UserError('That Discord link has expired. Press Link Discord again.');
      // e.g. started in the app and Discord came back in the phone's browser: a different chat identity.
      if (st.nonce_hash !== who.hash) throw new UserError('Finish linking in the same browser or app where you pressed Link Discord.');
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
      for (const x of older) if (x.vid !== who.vid) { await U.update(x.id, { discord_id: '', discord_name: '', discord_avatar: '', name: '', name_lower: '' }); bust(`bsu:${x.vid}`); }
      const fields: Record<string, any> = { discord_id: String(du.id), discord_name: discordName, discord_username: String(du.username || '').slice(0, 40), discord_avatar: discordAvatar(du) };
      if (carried && !(row && row.name)) Object.assign(fields, { name: carried.name, name_lower: carried.name_lower });
      else if (!(row && row.name)) {
        // 6.28: show the Discord name straight away: the first of their Discord display name / username that
        // is a valid chat name, not reserved, not taken and not a guild member's name.
        const candidates = [du.global_name, du.username].map((x) => String(x || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16)).filter((x, i, a) => x && a.indexOf(x) === i);
        for (const c of candidates) {
          if (nameProblem(c)) continue;
          const { items: taken } = await U.filter({ name_lower: c.toLowerCase() }, { limit: 2 });
          if (taken.some((x) => x.vid !== who.vid)) continue;
          const { items: members } = await b.asServiceRole.entities.Member.filter({ discord_name: c }, { limit: 1 });
          if (members.length) continue;
          Object.assign(fields, { name: c, name_lower: c.toLowerCase() });
          break;
        }
      }
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
