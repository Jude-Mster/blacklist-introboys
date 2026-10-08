// True when the site is open in an Android phone's browser — false on desktop,
// iPhone, and inside the installed app (an Android WebView marks itself "; wv",
// and a standalone display-mode means it was launched from a home-screen icon).
export function onAndroidBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  if (/; wv\)/i.test(ua) || /\bwv\b/.test(ua)) return false;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return false;
  return true;
}

// True inside the OLD Android app (a plain web view, which marks itself with "; wv").
// The new app runs on Chrome and never matches this.
export function inOldApp() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && (/; wv\)/i.test(ua) || /\bwv\b/.test(ua));
}

// True inside the NEW app: launched from a home-screen icon (standalone display mode)
// or via an Android app link (referrer starts with "android-app://").
export function inNewApp() {
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  if (typeof document !== "undefined" && document.referrer.startsWith("android-app://")) return true;
  return false;
}

// Show the "Download app" item: Android phone (browser or old app), but not the new
// app, not desktop, not iPhone.
export function shouldShowAppDownload() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  if (inNewApp()) return false;
  return true;
}