import React, { useState } from "react";
import { Download, Check, RotateCw, Copy, FileDown, ShieldCheck, PackageCheck, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// The same install steps shown by the app prompt card (src/components/AppPrompt.jsx),
// reused here so the "Download app" item in the More menu shows them too.
const STEPS = [
  { icon: FileDown, title: "Open the downloaded file", detail: "It's small (about 1 MB). Tap it in the notification bar, or tap Open. If Chrome asks, tap Download anyway." },
  { icon: ShieldCheck, title: "If asked, allow your browser to install apps", detail: "First time only: tap Settings, turn on 'Allow from this source', then go back." },
  { icon: PackageCheck, title: "Tap Install, then Open", detail: "If Play Protect warns about an unknown app, tap More details, then Install anyway. The app icon appears on your home screen." }
];
const OLD_APP_STEP = { icon: Trash2, title: "Delete the old app", detail: "Once the new one works, uninstall the old Blacklist app: hold its icon, then tap Uninstall." };

export default function AppDownloadGuide({ open, onOpenChange, url, oldApp }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  const steps = oldApp ? [...STEPS, OLD_APP_STEP] : STEPS;

  const openDownload = () => {
    if (oldApp) window.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-bronze bg-[hsl(0_0%_7%)] p-4 md:hidden">
        <DialogTitle className="font-heading text-lg font-bold text-white">{oldApp ? "Get the new app" : "Download app"}</DialogTitle>
        <DialogDescription className="text-sm text-mist">
          {oldApp ? "Smaller and faster, with war and HSB alerts even when the app is closed. Install it, then delete this old app." : "Faster on your phone, one tap from your home screen, and war and HSB alerts even when it's closed."}
        </DialogDescription>

        <button onClick={openDownload} className="btn-seal h-11 w-full text-sm">
          <Download className="h-4 w-4" /> {oldApp ? "Get the new app" : "Download for Android"}
        </button>

        <p className="mb-2 text-sm font-semibold text-white">How to install</p>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-crimson text-xs font-bold text-white">{i + 1}</span>
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

        {oldApp && (
          <div className="mt-3 rounded-md border border-bronze/60 bg-ink p-2">
            <p className="text-xs text-mist">Nothing downloading? Copy the link, open Chrome, paste it in the address bar.</p>
            <button onClick={copyLink} className="btn-bronze mt-2 h-9 w-full text-xs">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy download link</>}
            </button>
          </div>
        )}

        <button onClick={openDownload} className="btn-bronze mt-3 h-11 w-full text-sm">
          <RotateCw className="h-4 w-4" /> Download again
        </button>

        <p className="text-[11px] leading-snug text-mist/80">
          Your phone may warn about apps from outside the Play Store. This app is the guild's own.
        </p>
      </DialogContent>
    </Dialog>
  );
}