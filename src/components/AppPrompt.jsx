import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useGuild } from "@/lib/GuildContext";

const KEY = "bi.app.prompt.until";
const SNOOZE_DAYS = 7;

// True on an Android phone's browser. False on desktop, iPhone, and inside the
// app itself (an Android WebView marks itself with "; wv").
function onAndroidBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  if (/; wv\)/i.test(ua) || /\bwv\b/.test(ua)) return false;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return false;
  return true;
}

function snoozed() {
  try {
    return Number(window.localStorage.getItem(KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

// Invites members on Android phones to download the guild app. The link comes
// from Admin hall -> Guild settings -> Android app; with no link nothing shows.
export default function AppPrompt() {
  const { settings } = useGuild();
  const url = settings && settings.app_download_url;
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setShow(!!url && onAndroidBrowser() && !snoozed());
  }, [url]);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    } catch {
      /* per-browser convenience only */
    }
    setShow(false);
  };

  return (
    <aside
      aria-label="Get the Android app"
      className="fixed inset-x-2 bottom-[calc(66px+env(safe-area-inset-bottom))] z-30 rounded-xl border border-crimson bg-[hsl(0_0%_7%/0.98)] p-3 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.9)] md:hidden"
    >
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl border border-bronze" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-semibold leading-tight text-white">Get the Blacklist12Sky app</p>
          <p className="text-xs text-mist">Faster on your phone, one tap from your home screen.</p>
        </div>
        <button onClick={dismiss} aria-label="Not now" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-mist">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setHelp(true)} className="btn-seal h-11 flex-1 text-sm">
          <Download className="h-4 w-4" /> Download for Android
        </a>
        <button onClick={dismiss} className="btn-bronze h-11 px-4 text-sm">Not now</button>
      </div>
      {help && (
        <p className="mt-2 text-xs text-mist">
          After the download finishes, open the file. If your phone asks, allow your browser to install apps, then tap Install.
        </p>
      )}
    </aside>
  );
}