import React, { useEffect, useState } from "react";
import { Download, X, Check, RotateCw, Copy, FileDown, ShieldCheck, PackageCheck, Trash2 } from "lucide-react";
import { useGuild } from "@/lib/GuildContext";

const KEY = "bi.app.prompt.done";       // set by "Done" (they installed it)
const VISIT_KEY = "bi.app.prompt.visit"; // set by "Not now": hidden for this visit only
const DONE_DAYS = 30;

// True on an Android phone's browser. False on desktop, iPhone, and inside an app.
function onAndroidBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  if (inOldApp()) return false;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return false;
  if (typeof document !== "undefined" && document.referrer.startsWith("android-app://")) return false;
  return true;
}

// True inside the OLD Android app (a plain web view, which marks itself with "; wv").
// The new app runs on Chrome and never matches this.
function inOldApp() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && (/; wv\)/i.test(ua) || /\bwv\b/.test(ua));
}

// "Not now" only hides the invite until the site is opened again: every new visit in the
// phone's browser shows it. Only "Done" (after installing) keeps it away for longer.
function snoozed() {
  try {
    if (window.sessionStorage.getItem(VISIT_KEY) === "1") return true;
    return Number(window.localStorage.getItem(KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

const STEPS = [
  { icon: FileDown, title: "Open the downloaded file", detail: "It's small (about 1 MB). Tap it in the notification bar, or tap Open. If Chrome asks, tap Download anyway." },
  { icon: ShieldCheck, title: "If asked, allow your browser to install apps", detail: "First time only: tap Settings, turn on 'Allow from this source', then go back." },
  { icon: PackageCheck, title: "Tap Install, then Open", detail: "If Play Protect warns about an unknown app, tap More details, then Install anyway. The app icon appears on your home screen." }
];
const OLD_APP_STEP = { icon: Trash2, title: "Delete the old app", detail: "Once the new one works, uninstall the old Blacklist app: hold its icon, then tap Uninstall." };

// Invites members on Android phones to download the guild app, and members still on the
// old app to switch to the new one. The link comes from Admin hall -> Guild settings ->
// Android app; with no link nothing shows.
export default function AppPrompt() {
  const { settings } = useGuild();
  const url = settings && settings.app_download_url;
  const [show, setShow] = useState(false);
  const [guide, setGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const old = inOldApp();

  useEffect(() => {
    setShow(!!url && (onAndroidBrowser() || inOldApp()) && !snoozed());
  }, [url]);

  if (!show) return null;

  const hideFor = (days) => {
    try {
      window.localStorage.setItem(KEY, String(Date.now() + days * 86400000));
    } catch {
      /* per-browser convenience only */
    }
    setShow(false);
    setGuide(false);
  };
  const dismiss = () => {
    try {
      window.sessionStorage.setItem(VISIT_KEY, "1");
    } catch {
      /* per-visit convenience only */
    }
    setShow(false);
    setGuide(false);
  };
  const done = () => hideFor(DONE_DAYS);

  const openDownload = () => {
    setGuide(true);
    if (old) window.location.href = url; // the old app hands downloads to the phone, if it can
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  // The old app may not be able to download: copying the link lets members paste it into Chrome.
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  };
  const steps = old ? [...STEPS, OLD_APP_STEP] : STEPS;

  return (
    <aside
      aria-label="Get the Android app"
      className="fixed inset-x-2 bottom-[calc(66px+var(--safe-bottom))] z-30 max-h-[calc(100vh-80px)] overflow-y-auto rounded-xl border border-crimson bg-[hsl(0_0%_7%/0.98)] p-3 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.9)] md:hidden"
    >
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl border border-bronze" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-semibold leading-tight text-white">{old ? "New app available" : "Get the Blacklist12Sky app"}</p>
          <p className="text-xs text-mist">{old ? "Smaller and faster, with war and HSB alerts even when the app is closed. Install it, then delete this old app." : "Faster on your phone, one tap from your home screen, and war and HSB alerts even when it's closed."}</p>
        </div>
        <button onClick={dismiss} aria-label="Not now" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-mist">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!guide ? (
        <div className="mt-3 flex gap-2">
          <button onClick={openDownload} className="btn-seal h-11 flex-1 text-sm">
            <Download className="h-4 w-4" /> {old ? "Get the new app" : "Download for Android"}
          </button>
          <button onClick={dismiss} className="btn-bronze h-11 px-4 text-sm">Not now</button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold text-white">How to install</p>
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-crimson text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <s.icon className="h-4 w-4 shrink-0 text-crimson" />
                    <p className="text-sm font-medium leading-tight text-white">{s.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-mist">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {old && (
            <div className="mt-3 rounded-md border border-bronze/60 bg-ink p-2">
              <p className="text-xs text-mist">Nothing downloading? Copy the link, open Chrome, paste it in the address bar.</p>
              <button onClick={copyLink} className="btn-bronze mt-2 h-9 w-full text-xs">
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy download link</>}
              </button>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={openDownload} className="btn-bronze h-11 flex-1 text-sm">
              <RotateCw className="h-4 w-4" /> Download again
            </button>
            <button onClick={done} className="btn-seal h-11 flex-1 text-sm">
              <Check className="h-4 w-4" /> Done
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-mist/80">
        Your phone may warn about apps from outside the Play Store. This app is the guild's own.
      </p>
    </aside>
  );
}