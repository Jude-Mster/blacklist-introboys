import React, { useState } from "react";
import { Bell, Flame, Swords, Volume2, Smartphone } from "lucide-react";
import Panel from "@/components/Panel";
import { cn } from "@/lib/utils";
import {
  getAlertPrefs, setAlertPrefs, WAR_MIN_CHOICES, HSB_MIN_CHOICES, devicePermission, askDevicePermission, deviceNotify
} from "@/lib/alertPrefs";

// Profile > Notifications. Choices are saved on this device only, so the phone app and
// the browser can be set differently.

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full border transition-colors", on ? "border-crimson bg-crimson" : "border-bronze/60 bg-ink")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-6" : "left-0.5")} />
    </button>
  );
}

function Row({ icon: Icon, title, hint, children }) {
  return (
    <div className="flex items-center gap-3 border-t border-bronze/30 py-3 first:border-t-0 first:pt-0">
      <Icon className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-heading font-bold text-white">{title}</p>
        {hint && <p className="text-xs text-mist">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const Minutes = ({ value, choices, onChange, label }) => (
  <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}
    className="h-9 rounded border border-bronze/60 bg-ink px-2 text-sm text-white">
    {choices.map((m) => <option key={m} value={m}>{m} min before</option>)}
  </select>
);

const DEVICE_TEXT = {
  granted: "Allowed. You get a notification even when this page is in another tab.",
  default: "Not allowed yet. Switch this on and press Allow when your browser asks.",
  denied: "Blocked in your browser settings. Allow notifications for this site there, then come back.",
  unsupported: "Not available here (the phone app can't show these). The banner and sound still work while the app is open."
};
const RESULT_TEXT = {
  sent: "Device notification sent.",
  blocked: "Device notification not sent: not allowed on this device.",
  unsupported: "Device notification not available here.",
  failed: "Device notification failed on this device.",
  off: "Device notification is switched off."
};

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(getAlertPrefs);
  const [perm, setPerm] = useState(devicePermission);
  const [result, setResult] = useState("");
  const save = (change) => setPrefs(setAlertPrefs(change));

  const setDevice = async (on) => {
    save({ device: on });
    if (on) setPerm(await askDevicePermission());
  };

  const test = async (kind) => {
    setResult("");
    window.dispatchEvent(new CustomEvent("bi:alert-test", { detail: kind }));
    const dev = !prefs.device ? "off"
      : await deviceNotify(`BLACKLIST INTROBOYS: Test ${kind === "war" ? "war" : "HSB"} alert`, "Device notifications are working.", "test-" + kind).catch(() => "failed");
    setResult(`Banner shown. ${prefs.sound ? "Sound played." : "Sound is switched off."} ${RESULT_TEXT[dev] || ""}`);
  };

  return (
    <Panel title="Notifications" data-notification-settings>
      <Row icon={Swords} title="War alert" hint="Before the entrance opens, every hour.">
        {prefs.war && <Minutes label="War alert time" value={prefs.warMin} choices={WAR_MIN_CHOICES} onChange={(warMin) => save({ warMin })} />}
        <Toggle label="War alert" on={prefs.war} onChange={(war) => save({ war })} />
      </Row>
      <Row icon={Flame} title="HSB alert" hint="Before HSB opens, Wednesday and Saturday.">
        {prefs.hsb && <Minutes label="HSB alert time" value={prefs.hsbMin} choices={HSB_MIN_CHOICES} onChange={(hsbMin) => save({ hsbMin })} />}
        <Toggle label="HSB alert" on={prefs.hsb} onChange={(hsb) => save({ hsb })} />
      </Row>
      <Row icon={Volume2} title="Sound" hint="A short chime with each alert.">
        <Toggle label="Alert sound" on={prefs.sound} onChange={(sound) => save({ sound })} />
      </Row>
      <Row icon={Smartphone} title="Device notification" hint={DEVICE_TEXT[perm]}>
        <Toggle label="Device notification" on={prefs.device && perm !== "unsupported" && perm !== "denied"} onChange={setDevice} />
      </Row>
      <div className="mt-1 flex flex-wrap gap-2 border-t border-bronze/30 pt-3">
        <button type="button" data-test-alert="war" onClick={() => test("war")} className="btn-bronze h-9 px-3 text-sm"><Bell className="h-4 w-4" aria-hidden="true" /> Test war alert</button>
        <button type="button" data-test-alert="hsb" onClick={() => test("hsb")} className="btn-bronze h-9 px-3 text-sm"><Bell className="h-4 w-4" aria-hidden="true" /> Test HSB alert</button>
      </div>
      {result && <p role="status" data-test-result className="mt-2 text-sm text-mist">{result}</p>}
      <p className="mt-2 text-xs text-mist/80">Saved on this device only. Alerts need the site or the app to be open; they can't wake a closed app.</p>
    </Panel>
  );
}
