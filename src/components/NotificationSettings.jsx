import React, { useState } from "react";
import { Bell, Flame, Swords, Volume2, Smartphone, Mic, Vibrate } from "lucide-react";
import Panel from "@/components/Panel";
import { cn } from "@/lib/utils";
import {
  getAlertPrefs, setAlertPrefs, WAR_MIN_CHOICES, HSB_MIN_CHOICES, devicePermission, askDevicePermission, deviceNotify, canVibrate, canSpeak,
  pushSupported, getPushEndpoint, enablePush, disablePush, testPush
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
  push: "On. Alerts arrive even when the app or site is closed.",
  granted: "Allowed. You get a notification even when this page is in another tab.",
  default: "Not allowed yet. Switch this on and press Allow when your browser asks.",
  denied: "Blocked in your browser settings. Allow notifications for this site there, then come back.",
  unsupported: "The phone app can't show these yet. You still get the banner, voice and vibration while the app is open."
};
const RESULT_TEXT = {
  sent: "Device notification sent.",
  blocked: "Device notification not sent: not allowed on this device.",
  unsupported: "Device notification not available here.",
  failed: "Device notification failed on this device.",
  off: "Device notification is switched off.",
  push_sent: "Push sent: it should pop up on this device in a few seconds, even with the app closed.",
  push_missing: "Push is not set up on this device. Switch Device notification off and on again.",
  push_expired: "This device's push address expired. Switch Device notification off and on again.",
  push_failed: "Push could not be sent right now. Try again in a minute."
};

// Can this device play the recorded line? Played muted so it doesn't talk over the alert.
function probeVoice(kind) {
  return new Promise((done) => {
    try {
      const a = new window.Audio(kind === "hsb" ? "/sounds/get-ready-hsb.mp3" : "/sounds/get-ready-war.mp3");
      a.muted = true;
      const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); done(true); }, () => done(false)); else done(true);
      setTimeout(() => done(false), 4000);
    } catch { done(false); }
  });
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(getAlertPrefs);
  const [perm, setPerm] = useState(devicePermission);
  const [result, setResult] = useState("");
  const save = (change) => setPrefs(setAlertPrefs(change));

  const [pushOn, setPushOn] = useState(() => !!getPushEndpoint());
  const [busy, setBusy] = useState(false);
  const setDevice = async (on) => {
    save({ device: on });
    if (!on) { if (getPushEndpoint()) await disablePush(); setPushOn(false); return; }
    setBusy(true);
    try {
      if (pushSupported()) {
        const r = await enablePush();
        setPushOn(r === "on");
        if (r === "failed") setResult("Couldn't switch on push for this device. Notifications still show while the site is open.");
      }
      setPerm(await askDevicePermission());
    } finally { setBusy(false); }
  };

  const test = async (kind) => {
    setResult("");
    window.dispatchEvent(new CustomEvent("bi:alert-test", { detail: kind }));
    const dev = !prefs.device ? "off"
      : getPushEndpoint() ? "push_" + await testPush(kind)
      : await deviceNotify(`BLACKLIST INTROBOYS: Test ${kind === "war" ? "war" : "HSB"} alert`, "Device notifications are working.", "test-" + kind).catch(() => "failed");
    // Checked with a real (silent) play, so the line says what this device actually did.
    let voiceOk = false;
    if (prefs.sound && prefs.voice) { voiceOk = await probeVoice(kind); }
    setResult(`Banner shown. ${!prefs.sound ? "Sound is switched off." : voiceOk ? "Voice played." : "Chime played."} ${!prefs.vibrate ? "Vibrate is switched off." : canVibrate() ? "Vibration sent." : "Vibration not available here."} ${RESULT_TEXT[dev] || ""}`);
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
      <Row icon={Volume2} title="Sound" hint="Plays a sound with each alert.">
        <Toggle label="Alert sound" on={prefs.sound} onChange={(sound) => save({ sound })} />
      </Row>
      {prefs.sound && (
        <Row icon={Mic} title="Spoken alert" hint={"Says \"Get ready for War\" or \"Get ready for HSB\". Off plays a chime."}>
          <Toggle label="Spoken alert" on={prefs.voice && canSpeak()} onChange={(voice) => save({ voice })} />
        </Row>
      )}
      <Row icon={Vibrate} title="Vibrate" hint={canVibrate() ? "Buzzes the phone with each alert." : "This device can't vibrate from a web page."}>
        <Toggle label="Vibrate" on={prefs.vibrate && canVibrate()} onChange={(vibrate) => save({ vibrate })} />
      </Row>
      <Row icon={Smartphone} title="Device notification" hint={busy ? "Setting up this device..." : DEVICE_TEXT[pushOn && prefs.device ? "push" : perm]}>
        <Toggle label="Device notification" on={prefs.device && perm !== "unsupported" && perm !== "denied"} onChange={busy ? () => {} : setDevice} />
      </Row>
      <div className="mt-1 flex flex-wrap gap-2 border-t border-bronze/30 pt-3">
        <button type="button" data-test-alert="war" onClick={() => test("war")} className="btn-bronze h-9 px-3 text-sm"><Bell className="h-4 w-4" aria-hidden="true" /> Test war alert</button>
        <button type="button" data-test-alert="hsb" onClick={() => test("hsb")} className="btn-bronze h-9 px-3 text-sm"><Bell className="h-4 w-4" aria-hidden="true" /> Test HSB alert</button>
      </div>
      {result && <p role="status" data-test-result className="mt-2 text-sm text-mist">{result}</p>}
      <p className="mt-2 text-xs text-mist/80">Saved on this device only.{pushOn && prefs.device ? " War and HSB alerts also arrive when the app is closed." : " Without device notifications, alerts only show while the site or app is open."}</p>
    </Panel>
  );
}