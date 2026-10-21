// 6.33: the War Room (HSB planning board). Talking to warAction, and small drawing helpers.
import { base44 } from "@/api/base44Client";

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
