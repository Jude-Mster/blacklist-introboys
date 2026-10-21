// 6.33: the War Room, a chalkboard over the Wuxen2 maps where the guild's commanders and invited allies plan
// Holy Stone Battles. Shared rules for the warAction function.
import { sha256Hex } from './session.ts';

// Keep in step with WAR_MAPS in src/lib/warMaps.js.
export const WAR_MAP_IDS = ['z001', 'z002', 'z003', 'z004', 'z006', 'z007', 'z008', 'z009', 'z011', 'z012', 'z013', 'z014', 'z038', 'z074'];
export const CHALK_COLORS = ['#f4f1ea', '#ffd84d', '#ff5a52', '#6cc6ff', '#7be08b', '#ff8ad1'];
export const STAMP_IDS = ['attack', 'defend', 'target', 'stone', 'gate', 'guardian', 'rally', 'A', 'B', 'C'];

export const MAX_SHAPES = 1500;           // per page
export const MAX_POINTS = 60000;          // numbers in all the strokes of one page together
export const MAX_PATH_NUMS = 800;         // one stroke: up to 400 points
export const MAX_OPS = 60;                // per save
export const MAX_PAGES = 20;              // per plan
export const MAX_PLANS = 60;
export const GUEST_DAYS_DEFAULT = 30;

export const cleanText = (v, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const unit = (v) => { const n = Number(v); return Number.isFinite(n) && n >= -0.05 && n <= 1.05 ? Math.round(n * 10000) / 10000 : null; };
const ID_RE = /^[a-z0-9]{6,20}$/;

// A shape the board may hold, or null. Coordinates are fractions of the map (0..1), so every screen size agrees.
export function cleanShape(s, by: string) {
  if (!s || typeof s !== 'object' || !ID_RE.test(String(s.id || ''))) return null;
  const c = CHALK_COLORS.includes(String(s.c)) ? String(s.c) : CHALK_COLORS[0];
  const base = { id: String(s.id), c, by: cleanText(by, 40) };
  if (s.t === 'path') {
    if (!Array.isArray(s.pts) || s.pts.length < 4 || s.pts.length > MAX_PATH_NUMS || s.pts.length % 2) return null;
    const pts = s.pts.map(unit);
    if (pts.some((x) => x === null)) return null;
    const w = Math.min(14, Math.max(1, Math.round(Number(s.w) || 4)));
    return { ...base, t: 'path', w, pts };
  }
  if (s.t === 'arrow') {
    const [x1, y1, x2, y2] = [unit(s.x1), unit(s.y1), unit(s.x2), unit(s.y2)];
    if ([x1, y1, x2, y2].some((x) => x === null)) return null;
    const w = Math.min(14, Math.max(1, Math.round(Number(s.w) || 4)));
    return { ...base, t: 'arrow', w, x1, y1, x2, y2 };
  }
  if (s.t === 'text') {
    const [x, y] = [unit(s.x), unit(s.y)];
    const text = cleanText(s.s, 80);
    if (x === null || y === null || !text) return null;
    const size = Math.min(48, Math.max(12, Math.round(Number(s.size) || 20)));
    return { ...base, t: 'text', x, y, s: text, size };
  }
  if (s.t === 'stamp') {
    const [x, y] = [unit(s.x), unit(s.y)];
    if (x === null || y === null || !STAMP_IDS.includes(String(s.k))) return null;
    const note = cleanText(s.note, 30);
    return { ...base, t: 'stamp', k: String(s.k), x, y, ...(note ? { note } : {}) };
  }
  return null;
}
export const pointCount = (shapes) => shapes.reduce((a, s) => a + (s.t === 'path' ? s.pts.length : 4), 0);

// Apply a batch of edits to a page's shapes. canClear: commanders only.
export function applyOps(shapes: any[], ops: any[], by: string, canClear: boolean) {
  let out = shapes.slice();
  let changed = 0;
  for (const o of ops) {
    if (!o || typeof o !== 'object') continue;
    if (o.op === 'add') {
      const s = cleanShape(o.shape, by);
      if (!s || out.some((x) => x.id === s.id)) continue;
      out.push(s); changed++;
    } else if (o.op === 'move') {
      const i = out.findIndex((x) => x.id === String(o.id));
      const dx = Number(o.dx), dy = Number(o.dy);
      if (i < 0 || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1.2 || Math.abs(dy) > 1.2) continue;
      const s = { ...out[i] };
      const mv = (v, d) => Math.round(Math.min(1.05, Math.max(-0.05, v + d)) * 10000) / 10000;
      if (s.t === 'path') s.pts = s.pts.map((v, k) => mv(v, k % 2 ? dy : dx));
      else if (s.t === 'arrow') { s.x1 = mv(s.x1, dx); s.x2 = mv(s.x2, dx); s.y1 = mv(s.y1, dy); s.y2 = mv(s.y2, dy); }
      else { s.x = mv(s.x, dx); s.y = mv(s.y, dy); }
      out[i] = s; changed++;
    } else if (o.op === 'remove') {
      const ids = new Set((Array.isArray(o.ids) ? o.ids : [o.id]).map(String));
      const before = out.length;
      out = out.filter((x) => !ids.has(x.id));
      changed += before - out.length;
    } else if (o.op === 'clear' && canClear) {
      if (out.length) { out = []; changed++; }
    }
  }
  return { shapes: out, changed };
}

// Invite codes: chosen by the Guild Leader, 6 to 24 letters, numbers or dashes; compared without case.
export const CODE_RE = /^[A-Za-z0-9-]{6,24}$/;
export const normCode = (v) => String(v ?? '').trim().toUpperCase();
export const tokenHash = (t: string) => sha256Hex('bi-war-guest1:' + t);

// Per-connection limit kept in this running copy (code guessing).
const hits = new Map<string, number[]>();
export function memLimit(key: string, max: number, windowMs: number): boolean {
  if (!key) return true;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  if (hits.size > 20000) hits.clear();
  hits.set(key, list);
  return true;
}
export const clientIp = (req) => String(req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '').split(',')[0].trim().slice(0, 64);

// ---------- 6.34: guilds, chat, notifications ----------
// Every name in the War Room carries its guild. Guild members are BLACKLIST INTROBOYS in the guild's red;
// people who join with a code get the guild and colour the Guild Leader set on that code.
export const HOME_GUILD = { guild: 'BLACKLIST INTROBOYS', color: '#ff4d4f' };
// Keep in step with GUILD_COLORS in src/lib/warRoom.js.
export const GUILD_COLORS = ['#6cc6ff', '#7be08b', '#f2c14e', '#b48cff', '#ff8ad1', '#ff9f43', '#4dd6c1', '#c9d1d9'];
export const cleanGuild = (v) => cleanText(v, 32);
export const cleanColor = (v) => (GUILD_COLORS.includes(String(v)) ? String(v) : GUILD_COLORS[0]);

// The War Room chat is translated into these six (Filipino is 'tl').
export const WAR_LANGS = ['en', 'tl', 'tr', 'th', 'id', 'zh'] as const;
export const CHAT_MAX_LEN = 500;
export const CHAT_WINDOW = 120;            // newest messages every screen shares
export const CHAT_GAP_MS = 900;            // one message a second per person
export const ONLINE_MS = 2 * 60 * 1000;    // "online" = had the War Room open in the last two minutes
export const SEEN_EVERY_MS = 45 * 1000;    // how often an open War Room writes "still here"
export const NOTIFY_EDIT_GAP_MS = 10 * 60 * 1000;   // drawings: at most one notification per plan every 10 minutes
export const NOTIFY_NOTES_GAP_MS = 2 * 60 * 1000;   // orders: at most one every 2 minutes
