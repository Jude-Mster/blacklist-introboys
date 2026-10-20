// The app opens /link-app?link=XXXX-XXXX in the browser. A member who isn't signed in yet is sent to the
// Discord login first; the code waits here (ten minutes at most) and is picked up by the Assistant page.
const KEY = "bi.assistant.link";
const LIFE_MS = 10 * 60 * 1000;
const SHAPE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/;

export function holdLink(code) {
  if (!SHAPE.test(String(code || ""))) return false;
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ code: String(code).toUpperCase(), at: Date.now() })); return true; } catch { return false; }
}
export function hasPendingLink() {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    return !!(v && v.code && Date.now() - v.at < LIFE_MS);
  } catch { return false; }
}
// Read without removing (a page may render twice); the Assistant page clears it once it has used it.
export function peekPendingLink() {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    return v && v.code && Date.now() - v.at < LIFE_MS ? v.code : "";
  } catch { return ""; }
}
export function clearPendingLink() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
