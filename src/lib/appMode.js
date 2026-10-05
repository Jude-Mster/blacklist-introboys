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