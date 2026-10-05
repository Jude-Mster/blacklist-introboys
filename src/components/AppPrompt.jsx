import React, { useEffect, useState } from "react";
import { Download, X, Check, RotateCw, Wifi, FileDown, ShieldCheck, PackageCheck } from "lucide-react";
import { useGuild } from "@/lib/GuildContext";
import { onAndroidBrowser } from "@/lib/appMode";

const KEY = "bi.app.prompt.done";       // set by "Done" (they installed it)
const VISIT_KEY = "bi.app.prompt.visit"; // set by "Not now": hidden for this visit only
const DONE_DAYS = 30;

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
  { icon: Wifi, title: "Wait for the download to finish", detail: "About 100 MB — use Wi-Fi if you can." },
  { icon: FileDown, title: "Tap the downloaded file", detail: "In the notification bar, or tap Open in your browser's downloads." },
  { icon: ShieldCheck, title: "If asked, allow your browser to install apps", detail: "First time only: tap Settings, turn on 'Allow from this source', then go back." },
  { icon: PackageCheck, title: "Tap Install, then Open", detail: "The app icon appears on your home screen." }
];

// Invites members on Android phones to download the guild app. The link comes
// from Admin hall -> Guild settings -> Android app; with no link nothing shows.
export default function AppPrompt() {
  const { settings } = useGuild();
  const url = settings && settings.app_download_url;
  const [show, setShow] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    setShow(!!url && onAndroidBrowser() && !snoozed());
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
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <aside
      aria-label="Get the Android app"
      className="fixed inset-x-2 bottom-[calc(66px+env(safe-area-inset-bottom))] z-30 max-h-[calc(100vh-80px)] overflow-y-auto rounded-xl border border-crimson bg-[hsl(0_0%_7%/0.98)] p-3 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.9)] md:hidden"
    >
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl border border-bronze" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-semibold leading-tight text-white">Get the Blacklist12Sky app</p>
          <p className="text-xs text-mist">Easier access: faster on your phone, one tap from your home screen.</p>
        </div>
        <button onClick={dismiss} aria-label="Not now" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-mist">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!guide ? (
        <div className="mt-3 flex gap-2">
          <button onClick={openDownload} className="btn-seal h-11 flex-1 text-sm">
            <Download className="h-4 w-4" /> Download for Android
          </button>
          <button onClick={dismiss} className="btn-bronze h-11 px-4 text-sm">Not now</button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold text-white">How to install</p>
          <ol className="space-y-2.5">
            {STEPS.map((s, i) => (
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