import React from "react";
import { Download, Smartphone } from "lucide-react";
import Panel from "@/components/Panel";
import { useGuild } from "@/lib/GuildContext";

// 6.47: opens the Assistant in the BLACKLIST Android app (or does nothing when it isn't installed)
const OPEN_APP = "intent://assistant#Intent;scheme=introboys;package=com.blacklistintroboys.guild;end";
const onAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");

// The phone Assistant (the BLACKLIST Android app). The Guild Leader switches it on per member;
// it runs on a device's days like a PC.
export default function PhonePanel({ allowed }) {
  const { settings } = useGuild();
  // only members the Guild Leader allowed see the phone app and its download
  const url = (settings && settings.app_download_url) || "/app/introboys.apk";
  if (!allowed) return null;
  return (
    <Panel title="On your phone">
      <div className="flex items-start gap-3 text-sm">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <div className="min-w-0 space-y-2 text-mist">
          <p><b className="text-white">The phone Assistant is on for you.</b> It presses the game buttons you put bubbles on (attack, skills, buffs, auto loot), on your phone, while you have days.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Install the BLACKLIST app on your Android phone (Android 10 or newer). You get two icons: BLACKLIST (the guild hall) and <b className="text-white">IntroBoys Assistant</b>.</li>
            <li>Open IntroBoys Assistant and tap <b className="text-white">Sign in with the guild</b>: this page opens with the code to approve.</li>
            <li><b className="text-white">Allow restricted settings</b> (Android 13 and newer): Android blocks the tap permission for apps installed from a file. Tap <b className="text-white">App info</b> in the app, then the <b className="text-white">⋮</b> at the top right, then <b className="text-white">Allow restricted settings</b>. If there&apos;s no such option yet, do step 4 once (Android says it was denied) and come back.</li>
            <li>Tap <b className="text-white">Accessibility</b> in the app, then Installed apps, then <b className="text-white">IntroBoys Assistant taps</b>, and switch it on.</li>
            <li>Tap <b className="text-white">Show the floating S</b>, open the game, tap the S, then Bubbles: drag a bubble onto each game button and Save. Then tap the S and Start.</li>
          </ol>
          <p className="text-xs">You set it up once per phone. New versions install from inside the app (an Update button appears) and keep your permission and bubbles. Don&apos;t uninstall to update.</p>
          <p className="text-xs">A phone takes one of your devices, like a PC. To run it next to your PC, move some days to a new device in Overview.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={url} className="btn-seal inline-flex h-9 items-center gap-1.5 px-3 text-sm"><Download className="h-4 w-4" aria-hidden="true" /> Download the app</a>
            {onAndroid() && <a href={OPEN_APP} className="btn-bronze inline-flex h-9 items-center px-3 text-sm">Open the Assistant</a>}
          </div>
        </div>
      </div>
    </Panel>
  );
}