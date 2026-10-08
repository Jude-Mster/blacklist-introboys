// Each member's notification choices for guild events. Kept on the device (the app and
// the browser each have their own), so no account data is involved.
const KEY = "bi.alerts.prefs";
export const WAR_MIN_CHOICES = [3, 6, 10, 15];
export const HSB_MIN_CHOICES = [5, 10, 15, 30];
export const DEFAULT_PREFS = { war: true, hsb: true, sound: true, voice: true, vibrate: true, device: true, warMin: 6, hsbMin: 10 };

export function getAlertPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { saved = {}; }
  const p = { ...DEFAULT_PREFS };
  for (const k of ["war", "hsb", "sound", "voice", "vibrate", "device"]) if (typeof saved[k] === "boolean") p[k] = saved[k];
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

// ----- Vibration and the spoken line -----
export const VIBRATE_PATTERN = [300, 120, 300, 120, 500];
export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
// Returns true when the phone accepted the buzz.
export function buzz() { try { return canVibrate() ? navigator.vibrate(VIBRATE_PATTERN) !== false : false; } catch { return false; } }

// The spoken line is a recorded clip (public/sounds), so it sounds the same everywhere and
// also works inside the phone app, which has no built-in voice.
export const SPOKEN = { war: "/sounds/get-ready-war.mp3", hsb: "/sounds/get-ready-hsb.mp3" };
export const canSpeak = () => typeof window !== "undefined" && typeof window.Audio === "function";
const clips = {};
// Plays the line. Resolves true once it is playing, false if this device refused
// (the caller then plays the chime instead).
export function speak(kind) {
  return new Promise((done) => {
    if (!canSpeak()) return done(false);
    let settled = false; const end = (ok) => { if (!settled) { settled = true; done(ok); } };
    try {
      const src = SPOKEN[kind] || SPOKEN.war;
      const a = clips[src] || (clips[src] = new window.Audio(src));
      a.currentTime = 0; a.volume = 1;
      const p = a.play();
      if (p && p.then) p.then(() => end(true), () => end(false)); else end(true);
      setTimeout(() => end(false), 4000);
    } catch { end(false); }
  });
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
  // icon: the guild logo. badge: the small white S Android puts in the status bar.
  const opts = { body, tag, icon: "/notify-icon.png", badge: "/notify-badge.png", renotify: true };
  if (getAlertPrefs().vibrate) opts.vibrate = VIBRATE_PATTERN;
  try {
    const reg = await worker();
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return "sent"; }
  } catch { /* fall through to the plain kind */ }
  try { new Notification(title, opts); return "sent"; } catch { return "failed"; }
}