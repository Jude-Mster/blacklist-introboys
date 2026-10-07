// Each member's notification choices for guild events. Kept on the device (the app and
// the browser each have their own), so no account data is involved.
const KEY = "bi.alerts.prefs";
export const WAR_MIN_CHOICES = [3, 6, 10, 15];
export const HSB_MIN_CHOICES = [5, 10, 15, 30];
export const DEFAULT_PREFS = { war: true, hsb: true, sound: true, device: true, warMin: 6, hsbMin: 10 };

export function getAlertPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { saved = {}; }
  const p = { ...DEFAULT_PREFS };
  for (const k of ["war", "hsb", "sound", "device"]) if (typeof saved[k] === "boolean") p[k] = saved[k];
  if (WAR_MIN_CHOICES.includes(saved.warMin)) p.warMin = saved.warMin;
  if (HSB_MIN_CHOICES.includes(saved.hsbMin)) p.hsbMin = saved.hsbMin;
  return p;
}

export function setAlertPrefs(change) {
  const next = { ...getAlertPrefs(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts until the page closes */ }
  try { window.dispatchEvent(new CustomEvent("bi:alertprefs", { detail: next })); } catch { /* old browser */ }
  return next;
}

// ----- Device notifications (the ones that show outside the page) -----
// "unsupported" is what the phone app reports: Android's in-app web view has no
// notification support, so the app shows the banner and sound only.
export const devicePermission = () => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");

let swReady = null;
function worker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!swReady) {
    swReady = navigator.serviceWorker.register("/sw.js")
      .then(() => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]))
      .catch(() => null);
  }
  return swReady;
}

export async function askDevicePermission() {
  if (devicePermission() === "unsupported") return "unsupported";
  let p = Notification.permission;
  if (p === "default") { try { p = await Notification.requestPermission(); } catch { p = "denied"; } }
  if (p === "granted") worker();
  return p;
}

// Returns "sent", "blocked", "unsupported" or "failed".
export async function deviceNotify(title, body, tag) {
  const p = devicePermission();
  if (p === "unsupported") return "unsupported";
  if (p !== "granted") return "blocked";
  const opts = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" };
  try {
    const reg = await worker();
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return "sent"; }
  } catch { /* fall through to the plain kind */ }
  try { new Notification(title, opts); return "sent"; } catch { return "failed"; }
}
