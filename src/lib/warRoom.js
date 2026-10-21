// 6.33: the War Room (HSB planning board). Talking to warAction, and small drawing helpers.
import { base44 } from "@/api/base44Client";
import { askDevicePermission, worker } from "@/lib/alertPrefs";

const PASS_KEY = "bi.war.pass";      // a non-member's War Room pass (from an invite code)
const COUNCIL_KEY = "bi.war.council"; // a member who joined with a code: show War Room in the menu
const read = (k) => { try { return window.localStorage.getItem(k) || ""; } catch { return ""; } };
const write = (k, v) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch { /* storage off */ } };

export const getPass = () => read(PASS_KEY);
export const setPass = (t) => write(PASS_KEY, t);
export const markCouncil = (on) => write(COUNCIL_KEY, on ? "1" : "");
export const isCouncil = () => read(COUNCIL_KEY) === "1";

export async function war(action, data = {}) {
  const pass = getPass();
  const res = await base44.functions.invoke("warAction", { action, ...(pass ? { _w: pass } : {}), ...data });
  return res && res.data;
}
export const warError = (e, fallback = "That didn't work. Try again.") => {
  const d = (e && e.data) || (e && e.response && e.response.data);
  return (d && typeof d.error === "string" && d.error) || (e && e.message) || fallback;
};

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Fewer points for a stroke that looks the same (Ramer-Douglas-Peucker), so boards stay small.
export function simplify(pts, eps = 0.0018) {
  if (pts.length <= 4) return pts;
  const P = [];
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
  const keep = new Array(P.length).fill(false);
  keep[0] = keep[P.length - 1] = true;
  const stack = [[0, P.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bi = -1;
    const [x1, y1] = P[a], [x2, y2] = P[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * P[i][0] - dx * P[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = true; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  P.forEach((p, i) => { if (keep[i]) out.push(Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000); });
  return out.slice(0, 800);
}

// The same edits the server makes (shared/warRoom.ts applyOps), so a drawing shows at once.
export function applyLocal(shapes, ops, by) {
  let out = shapes.slice();
  for (const o of ops) {
    if (o.op === "add") { if (!out.some((s) => s.id === o.shape.id)) out.push({ ...o.shape, by }); }
    else if (o.op === "move") {
      out = out.map((s) => {
        if (s.id !== o.id) return s;
        if (s.t === "path") return { ...s, pts: s.pts.map((v, k) => v + (k % 2 ? o.dy : o.dx)) };
        if (s.t === "arrow") return { ...s, x1: s.x1 + o.dx, x2: s.x2 + o.dx, y1: s.y1 + o.dy, y2: s.y2 + o.dy };
        return { ...s, x: s.x + o.dx, y: s.y + o.dy };
      });
    } else if (o.op === "remove") { const ids = new Set(o.ids || [o.id]); out = out.filter((s) => !ids.has(s.id)); }
    else if (o.op === "clear") out = [];
  }
  return out;
}

// ---------- 6.34: guilds ----------
// Keep in step with GUILD_COLORS / HOME_GUILD in base44/shared/warRoom.ts.
export const HOME_GUILD = { guild: "BLACKLIST INTROBOYS", color: "#ff4d4f" };
export const GUILD_COLORS = [
  { color: "#6cc6ff", label: "Sky blue" }, { color: "#7be08b", label: "Green" }, { color: "#f2c14e", label: "Gold" },
  { color: "#b48cff", label: "Violet" }, { color: "#ff8ad1", label: "Pink" }, { color: "#ff9f43", label: "Orange" },
  { color: "#4dd6c1", label: "Teal" }, { color: "#c9d1d9", label: "Silver" }
];

// ---------- 6.34: the War Room chat ----------
export const WAR_LANGS = [
  { code: "en", name: "English", label: "English" },
  { code: "tl", name: "Filipino", label: "Filipino" },
  { code: "tr", name: "Turkish", label: "Türkçe" },
  { code: "th", name: "Thai", label: "ไทย (Thai)" },
  { code: "id", name: "Indonesian", label: "Bahasa Indonesia" },
  { code: "zh", name: "Chinese (Taiwan)", label: "繁體中文 (台灣)" }
];
export const WAR_LANG_NAME = Object.fromEntries(WAR_LANGS.map((l) => [l.code, l.name]));
export const CHAT_MAX_LEN = 500;
const CHAT_PREF_KEY = "bi.war.chatprefs";
function guessLang() {
  try {
    const l = String(navigator.language || "en").toLowerCase();
    if (l.startsWith("fil") || l.startsWith("tl")) return "tl";
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("in") || l.startsWith("ms")) return "id";
    for (const c of ["tr", "th", "id"]) if (l.startsWith(c)) return c;
  } catch { /* no navigator */ }
  return "en";
}
export function chatPrefs() {
  let p = {};
  try { p = JSON.parse(read(CHAT_PREF_KEY) || "{}") || {}; } catch { p = {}; }
  return { lang: WAR_LANG_NAME[p.lang] ? p.lang : guessLang(), auto: p.auto !== false };
}
export const saveChatPrefs = (p) => write(CHAT_PREF_KEY, JSON.stringify(p));

// ---------- 6.34: "new" marks on plans ----------
const SEEN_KEY = "bi.war.planseen";
export function planSeen() { try { return JSON.parse(read(SEEN_KEY) || "{}") || {}; } catch { return {}; } }
export function markPlanSeen(id, at) {
  const s = planSeen();
  if (!id || (s[id] && s[id] >= at)) return;
  s[id] = at;
  const keep = Object.entries(s).sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 80);
  write(SEEN_KEY, JSON.stringify(Object.fromEntries(keep)));
}

// ---------- 6.34: plan notifications on this phone or computer ----------
const PUSH_KEY = "bi.war.push";
export const warPushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const warPushEndpoint = () => read(PUSH_KEY);
function keyBytes(b64) {
  const t = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const sameBytes = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
// Returns "on", "denied", "unsupported" or "failed".
export async function enableWarPush() {
  if (!warPushSupported()) return "unsupported";
  const perm = await askDevicePermission();
  if (perm !== "granted") return perm === "unsupported" ? "unsupported" : "denied";
  try {
    const reg = await worker();
    if (!reg || !reg.pushManager) return "failed";
    const { public_key: key } = await war("pushKey");
    if (!key) return "failed";
    let sub = await reg.pushManager.getSubscription();
    const old = sub && sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (sub && !sameBytes(old, keyBytes(key))) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const json = sub.toJSON();
    const device = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "").slice(0, 40);
    const r = await war("pushOn", { sub: { endpoint: json.endpoint, keys: json.keys }, device });
    if (!r || !r.ok) return "failed";
    write(PUSH_KEY, json.endpoint);
    return "on";
  } catch { return "failed"; }
}
// Only the War Room stops sending: the same browser subscription may also carry the war and HSB alerts.
export async function disableWarPush() {
  const endpoint = warPushEndpoint();
  write(PUSH_KEY, "");
  try { if (endpoint) await war("pushOff", { endpoint }); } catch { /* forgotten when it next fails */ }
}
export async function warPushStatus() {
  const endpoint = warPushEndpoint();
  if (!endpoint) return false;
  try { const r = await war("pushStatus", { endpoint }); if (!r.on) write(PUSH_KEY, ""); return !!r.on; } catch { return true; }
}
