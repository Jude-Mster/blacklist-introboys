// 6.25: Wuxen2 Buy and Sell, the open chat for every visitor (no sign-in needed).
//
// One store for the whole page: the floating bubble on the home page and the chat itself read the same
// answers, so a page never asks twice. It asks the server every few seconds while a chat is on screen
// (a little less often when nothing is happening), every 15 s when only the bubble is showing, and not at
// all while the tab is hidden.
import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";

export const LANGS = [
  { code: "en", name: "English", label: "English" },
  { code: "tl", name: "Filipino", label: "Filipino (Tagalog)" },
  { code: "th", name: "Thai", label: "ไทย (Thai)" },
  { code: "es", name: "Spanish", label: "Español" },
  { code: "pt", name: "Portuguese", label: "Português" },
  { code: "id", name: "Indonesian", label: "Bahasa Indonesia" },
  { code: "zh", name: "Chinese (Taiwan)", label: "繁體中文 (台灣)" },  // 6.26
  { code: "tr", name: "Turkish", label: "Türkçe" }                  // 6.34
];
export const LANG_NAME = Object.fromEntries(LANGS.map((l) => [l.code, l.name]));
export const MAX_LEN = 300;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;   // 6.28: 10 MB (was 3)
export const SEND_GAP_MS = 1500;   // 6.28: the server allows one message every 1.5 s
export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const RESERVED = /juts|introboys|blacklist|admin|officer|moderator|anonymous|staff|official/i;
// The same checks the server makes, so a message is refused before it is sent.
export function blockedReason(text) {
  const t = String(text || "");
  const squeezed = t.toLowerCase().replace(/\s+/g, "");
  if (/https?:|www\.|:\/\//i.test(t)) return "Links are blocked.";
  if (/\b[a-z0-9-]{2,}\.(com|net|org|gg|io|ph|xyz|app|link|ly|site|shop|store|online)\b/i.test(t)) return "Links are blocked.";
  if (/\b[a-z0-9-]{2,}\s*(\(dot\)|\[dot\]|\s\.\s|\sdot\s)\s*(com|net|org|gg|io|ph|xyz)\b/i.test(t)) return "Links are blocked.";
  if (/discord(app)?\.(gg|com)|t\.me\/|bit\.ly|tinyurl/.test(squeezed)) return "Links are blocked.";
  for (const run of t.match(/\+?\d[\d\s\-().]{6,}\d/g) || []) {
    const d = run.replace(/\D/g, "");
    if (d.length < 10 || d.length > 13) continue;
    const r = run.trim();
    if (r.startsWith("+") || (d.startsWith("0") && d.length <= 11) || /^(63|66|62|55|60|65)\d{9,11}$/.test(d) || (/^9\d{9}$/.test(d) && !/0{5,}$/.test(d)) || /^\(?\d{3,4}\)?[\s\-.]\d{3,4}[\s\-.]\d{4}$/.test(r)) return "Phone numbers are blocked.";
  }
  return "";
}

// ---------- this browser's anonymous identity ----------
const ANON_KEY = "bi.wx.anon";
const READ_KEY = "bi.wx.read";
const PREF_KEY = "bi.wx.prefs";
const BLOCK_KEY = "bi.wx.blocked";
let memoryToken = "";
const randomHex = (n) => Array.from(window.crypto.getRandomValues(new Uint8Array(n))).map((x) => x.toString(16).padStart(2, "0")).join("");
function load(key, fallback) {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, v) {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: kept for this visit only */ }
}
export function anonToken() {
  try {
    let t = window.localStorage.getItem(ANON_KEY) || "";
    if (!/^[a-f0-9]{64}$/.test(t)) { t = randomHex(32); window.localStorage.setItem(ANON_KEY, t); }
    return t;
  } catch {
    if (!memoryToken) memoryToken = randomHex(32);
    return memoryToken;
  }
}

export async function api(action, data = {}) {
  const res = await base44.functions.invoke("buysellAction", { action, _a: anonToken(), ...data });
  return res && res.data;
}

function guessLang() {
  try {
    const l = String(navigator.language || "en").toLowerCase();
    if (l.startsWith("fil") || l.startsWith("tl")) return "tl";
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("tr")) return "tr";
    for (const c of ["th", "es", "pt", "id"]) if (l.startsWith(c)) return c;
    if (l.startsWith("in") || l.startsWith("ms")) return "id";
  } catch { /* no navigator */ }
  return "en";
}

// ---------- the store ----------
const prefs = load(PREF_KEY, null) || {};
let state = {
  me: null,
  off: false,
  open: [],              // open-chat messages, oldest first
  dms: [],               // my private messages, oldest first
  read: load(READ_KEY, {}),          // peer vid -> time of the last message I've seen from them
  blocked: load(BLOCK_KEY, []),
  lang: prefs.lang || guessLang(),
  auto: prefs.auto !== false,
  banner: null,          // the newest private message that arrived while its chat wasn't open
  viewing: "",           // the private chat on screen ('' = none)
  ready: false,
  error: ""
};
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; for (const l of listeners) l(); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getState = () => state;

const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
function mergeOpen(items) {
  if (!items || !items.length) return false;
  const map = new Map(state.open.map((m) => [m.id, m]));
  let fresh = false;
  for (const m of items) { if (!map.has(m.id)) fresh = true; map.set(m.id, m); }
  set({ open: [...map.values()].sort(byTime).slice(-200) });
  return fresh;
}
let dmPrimed = false;
function mergeDms(items, history = false) {
  if (!items || !items.length) return false;
  const map = new Map(state.dms.map((m) => [m.id, m]));
  let newest = null;
  for (const d of items) {
    if (!map.has(d.id) && !history && dmPrimed && state.me && !isMine(state, d.from) && !state.blocked.includes(d.from)) newest = d;
    map.set(d.id, d);
  }
  const patch = { dms: [...map.values()].sort(byTime).slice(-600) };
  if (newest && state.viewing !== newest.from) patch.banner = newest;
  if (newest && state.viewing === newest.from) markRead(newest.from, newest.at);
  set(patch);
  return !!newest;
}

export function markRead(peer, at) {
  if (!peer) return;
  const last = at || [...state.dms].reverse().find((d) => d.from === peer)?.at || new Date().toISOString();
  if ((state.read[peer] || "") >= last) return;
  const read = { ...state.read, [peer]: last };
  save(READ_KEY, read);
  set({ read, banner: state.banner && state.banner.from === peer ? null : state.banner });
}
export const setViewing = (peer) => { set({ viewing: peer || "" }); if (peer) markRead(peer); };
export const dismissBanner = () => set({ banner: null });
export function setLang(lang) { save(PREF_KEY, { lang, auto: state.auto }); set({ lang }); }
export function setAuto(auto) { save(PREF_KEY, { lang: state.lang, auto }); set({ auto }); }
export function block(vid) {
  const blocked = [...new Set([...state.blocked, vid])].slice(-200);
  save(BLOCK_KEY, blocked);
  set({ blocked, banner: state.banner && state.banner.from === vid ? null : state.banner });
}
export const setMe = (me) => set({ me });
// 6.27: someone can own two ids (their own and the one they use while their name is hidden).
export const myVids = (s) => (s.me ? s.me.vids || [s.me.vid] : []);
export const isMine = (s, vid) => !!vid && myVids(s).includes(vid);

// Conversations, newest first, from my private messages.
export function conversations(s) {
  const map = new Map();
  for (const d of s.dms) {
    const mine = isMine(s, d.from);
    const peer = mine ? d.to : d.from;
    if (s.blocked.includes(peer)) continue;
    const who = mine ? { name: d.to_name, tag: d.to_tag, kind: d.to_kind, avatar: d.to_avatar || "" } : { name: d.name, tag: d.tag, kind: d.kind, avatar: d.avatar || "" };
    const c = map.get(peer) || { vid: peer, ...who, last: null, unread: 0 };
    if (!mine && (who.name || who.kind)) Object.assign(c, who);   // their latest name
    c.last = d;
    c.via = mine ? d.from : d.to;   // which of my ids this conversation uses
    if (!mine && d.at > (s.read[peer] || "")) c.unread++;
    map.set(peer, c);
  }
  return [...map.values()].sort((a, b) => byTime(b.last, a.last));
}
export const unreadTotal = (s) => conversations(s).reduce((n, c) => n + c.unread, 0);

// ---------- asking the server ----------
const wanted = { full: 0, lite: 0 };
let timer = 0;
let busy = false;
let lastNews = 0;
let since = "";
let dmSince = "";
let inboxDone = false;
let trSince = "";   // 6.26: the server time of the last poll, so translations made since then come through
let helloDone = false;

async function hello() {
  if (helloDone) return;
  const r = await api("hello");
  helloDone = true;
  set({ me: r.me, off: !!r.off });
}

// ---------- 6.28: live updates ----------
// The server touches a public BuySellPulse row on every change. Open-chat messages arrive inside the pulse
// itself (no call at all); for private messages the pulse only names a bucket of 64, and a screen whose
// ids fall in that bucket asks for its messages right away. If live updates never arrive (blocked, offline)
// the regular asking below still catches everything up.
const DM_BUCKETS = 64;
export function bucketOf(vid) {
  let h = 5381;
  const t = String(vid || "");
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return h % DM_BUCKETS;
}
let live = false;          // a pulse has arrived: live updates work here
let liveUnsub = null;
let after = "";            // the newest change we were told about: the server must answer from after it
let soonTimer = 0;
let lastSoon = 0;
function pollSoon(at) {
  if (at && at > after) after = at;
  if (soonTimer) return;
  const wait = Math.max(0, 600 - (Date.now() - lastSoon));   // at most ~1.5 asks a second, however busy
  soonTimer = setTimeout(() => { soonTimer = 0; lastSoon = Date.now(); schedule(0); }, wait);
}
function onPulse(ev) {
  const d = ev && ev.data;
  if (!d || !d.key) return;
  live = true;
  if (d.key === "open") {
    if (!wanted.full) return;
    if (d.op === "msg" && d.msg && d.msg.id) { mergeOpen([d.msg]); lastNews = Date.now(); }
    else if (d.op === "gone" && Array.isArray(d.ids)) set({ open: state.open.filter((m) => !d.ids.includes(m.id)) });
    return;
  }
  const mine = state.me ? (state.me.vids || [state.me.vid]).map((v) => `dm:${bucketOf(v)}`) : [];
  if (mine.includes(d.key)) pollSoon(d.at);
}
function startLive() {
  if (liveUnsub || typeof window === "undefined") return;
  try { liveUnsub = base44.entities.BuySellPulse.subscribe(onPulse) || null; } catch { liveUnsub = null; }
}

async function tick() {
  timer = 0;
  if (!wanted.full && !wanted.lite) return;
  if (typeof document !== "undefined" && document.hidden) return;   // nobody is looking; asked again when shown
  if (busy) return schedule(1000);
  busy = true;
  try {
    await hello();
    const full = wanted.full > 0;
    if (full && !inboxDone) {
      const ib = await api("inbox");
      inboxDone = true;
      mergeDms(ib.dms, true);
      for (const d of ib.dms) if (d.at > dmSince) dmSince = d.at;
    }
    const askAfter = after;
    const r = await api("poll", { lite: !full, since: full ? since : "", dmSince, trSince, after: askAfter || undefined });
    if (after === askAfter) after = "";
    if (r.off) set({ off: true });
    if (r.now) trSince = r.now;
    let news = false;
    if (full) {
      news = mergeOpen(r.items) || news;
      for (const m of r.items) if (m.at > since) since = m.at;
    }
    news = mergeDms(r.dms, !dmPrimed) || news;
    dmPrimed = true;
    for (const d of r.dms) if (d.at > dmSince) dmSince = d.at;
    if (news) lastNews = Date.now();
    set({ ready: true, error: "" });
  } catch (e) {
    set({ ready: true, error: (e && e.response && e.response.data && e.response.data.error) || "Can't reach the chat right now. Trying again." });
  } finally {
    busy = false;
    schedule();
  }
}

function interval() {
  // With live updates working, asking is only a safety net.
  if (!wanted.full) return live ? 30000 : 15000;
  if (live) return 12000;
  const quiet = Date.now() - lastNews;
  return quiet < 30000 ? 3000 : quiet < 120000 ? 5000 : 9000;
}
function schedule(ms) {
  if (timer) clearTimeout(timer);
  if (!wanted.full && !wanted.lite) return;
  timer = setTimeout(tick, ms ?? interval());
}
export const pollNow = () => { lastNews = Date.now(); schedule(0); };

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(0); });
}

// A component that shows the chat (mode 'full') or only the bubble ('lite').
export function useBuySell(mode = "full") {
  useEffect(() => {
    wanted[mode]++;
    startLive();
    if (mode === "full") lastNews = Date.now();
    schedule(0);
    return () => { wanted[mode]--; schedule(); };
  }, [mode]);
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------- sending ----------
let lastSent = 0;
export const cooldownLeft = () => Math.max(0, SEND_GAP_MS - (Date.now() - lastSent));

// 6.26: instant. The message is shown at once (marked pending) and swapped for the real one when the
// server has it; then its translation is asked for in the background. On failure it is taken back out and
// the error is passed on, so the screen can put the words back in the box.
let tmpN = 0;
const nowIso = () => new Date().toISOString();
const dropTmp = (id) => set({ open: state.open.filter((m) => m.id !== id), dms: state.dms.filter((m) => m.id !== id) });
// 6.28: never refused for being quick: a message typed within 1.5 s of the last one shows at once and goes
// out the moment the gap has passed.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chain = Promise.resolve();   // messages go out one after another, in the order they were typed
let lastAck = 0;                 // when the server took the last one (its 1.5 s gap starts about then)
const tooSoon = (e) => { const st = (e && (e.status || (e.response && e.response.status))) || 0; return st === 429 || (e && e.rateLimited); };
async function sendNow(payload) {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, SEND_GAP_MS + 150 - (Date.now() - lastAck));
    if (wait > 0) await sleep(wait);
    try {
      const r = await api("send", payload);
      lastAck = Date.now();
      return r;
    } catch (e) {
      if (!tooSoon(e) || attempt >= 3) throw e;
      lastAck = Date.now();   // "too soon" or a busy moment: wait a gap and try again, quietly
    }
  }
}
export async function send({ text, image, to, peer, from }) {
  lastSent = Date.now();
  const me = state.me || {};
  const id = `tmp-${++tmpN}`;
  const at = nowIso();
  if (to) {
    const p = peer || {};
    set({ dms: [...state.dms, { id, pending: true, from: from || me.vid, to, name: me.name, tag: me.tag, kind: me.kind, avatar: me.avatar || "", to_name: p.name || "", to_tag: p.tag || "", to_kind: p.kind || "anon", text, image: image || "", lang: "", tr: null, at }] });
  } else {
    set({ open: [...state.open, { id, pending: true, vid: me.vid, name: me.name, tag: me.tag, kind: me.kind, role: me.role, avatar: me.avatar || "", text, image: image || "", lang: "", tr: null, at }] });
  }
  lastNews = Date.now();
  let r;
  try {
    const job = chain.catch(() => {}).then(() => sendNow({ text, image: image || undefined, to: to || undefined, from: from || undefined }));
    chain = job;
    r = await job;
  } catch (e) {
    dropTmp(id);
    throw e;
  }
  dropTmp(id);
  if (r.message) mergeOpen([r.message]);
  if (r.dm) { mergeDms([r.dm], true); markRead(to, r.dm.at); }
  schedule(1500);
  const real = r.message || r.dm;
  if (real && real.text) {
    api("translate", { id: real.id, where: r.dm ? "private" : "open" })
      .then((t) => { if (t && t.message) { if (r.dm) mergeDms([t.message], true); else mergeOpen([t.message]); } })
      .catch(() => { /* stays in its original language */ });
  }
  return r;
}

// 6.28: link or unlink Discord (visitors; members are linked through their guild sign-in).
export async function linkDiscord() {
  const r = await api("linkStart");
  window.location.assign(r.url);
}
export async function unlinkDiscord() {
  const r = await api("unlink");
  set({ me: r.me });
  return r;
}

// 6.27: show or hide my name; send my Discord card in a private chat.
export async function setHidden(hide) {
  const r = await api("setHidden", { hide });
  set({ me: r.me });
  return r;
}
export async function shareDiscord(to, from) {
  lastSent = Date.now();
  const r = await api("shareDiscord", { to, from: from || undefined });
  if (r.dm) { mergeDms([r.dm], true); markRead(to, r.dm.at); }
  lastNews = Date.now();
  schedule(1500);
  return r;
}

export async function report(id, where = "open") { return api("report", { id, where }); }
export async function moderate(action, data) {
  const r = await api(action, data);
  if (action === "remove" && data.where !== "private") set({ open: state.open.filter((m) => m.id !== data.id) });
  if (action === "remove" && data.where === "private") set({ dms: state.dms.filter((m) => m.id !== data.id) });
  if (action === "ban") { const gone = new Set(r.vids || []); set({ open: state.open.filter((m) => m.id !== data.id && !gone.has(m.vid)) }); }
  return r;
}

// Pictures: up to 10 MB as picked. Photos are made smaller before sending (the longest side at most
// 1600 px) so they go up quickly on a phone; GIFs are sent as they are.
export async function readImage(file) {
  if (!file || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Pick a JPG, PNG, WebP or GIF picture.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Pictures can be up to 10 MB.");
  const original = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Couldn't read that picture.")); r.readAsDataURL(file); });
  // 6.28: animated GIFs up to 4 MB go as they are; bigger ones are sent as a still picture so they go up fast.
  if (file.type === "image/gif" && file.size <= 4 * 1024 * 1024) return original;
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = original; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);   // see-through PNGs get a dark backing, not black-on-black
    g.drawImage(img, 0, 0, w, h);
    let q = 0.85, small = c.toDataURL("image/jpeg", q);
    while (small.length > 4 * 1024 * 1024 && q > 0.4) { q -= 0.15; small = c.toDataURL("image/jpeg", q); }
    return small.length < original.length ? small : original;
  } catch {
    if (original.length > 14 * 1024 * 1024) throw new Error("That picture is too big to send. Try a smaller one.");
    return original;
  }
}

// ---------- showing a message ----------
export const displayName = (x) => (x.kind === "member" || x.kind === "discord") && x.name ? x.name : `Anonymous #${x.tag || "0000"}`;
export function bodyOf(m, s, original) {
  if (original || !s.auto || !m.tr || !m.lang || m.lang === s.lang) return { text: m.text, translated: false };
  const t = m.tr[s.lang];
  return t && t !== m.text ? { text: t, translated: true } : { text: m.text, translated: false };
}
// Saved times may come without a time zone (they are UTC) or with extra digits: read them as UTC.
export function parseAt(iso) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?)\d*(Z|[+-]\d\d:?\d\d)?/.exec(String(iso || ""));
  return m ? Date.parse(m[1] + (m[2] || "Z")) : Date.parse(iso);
}
export function ago(iso) {
  const at = parseAt(iso);
  if (!Number.isFinite(at)) return "";
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const d = new Date(at);
  return s < 86400 ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const HUES = ["#f1b860", "#8fb8ff", "#c7a6ff", "#7fdca0", "#ff9a8a", "#f1d38c", "#9fe3e0"];
export const hueOf = (vid) => HUES[parseInt(String(vid || "7").replace(/[^0-9a-f]/gi, "").slice(-6) || "7", 16) % HUES.length];
