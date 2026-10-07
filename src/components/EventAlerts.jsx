import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Flame, Swords, X } from "lucide-react";
import { warStatus, localTime } from "@/lib/war";
import { hsbStatus } from "@/lib/hsb";
import { getAlertPrefs, askDevicePermission, deviceNotify, devicePermission } from "@/lib/alertPrefs";

// Heads-up alerts for guild events, shown on every page of the site:
//   - Regular Battle (the war): 6 minutes before the entrance opens
//   - HSB: 10 minutes before it opens
// Members can switch each one off, change the minutes, mute the sound and send a test
// from Profile > Notifications (src/components/NotificationSettings.jsx).
// Each alert is a banner at the top of the page with a short chime, and, if the member
// has allowed it, a notification from the browser so it is seen in another tab too.
// These only work while the site (or the installed app) is open somewhere on the device.
export const WAR_ALERT_MIN = 6;
export const HSB_ALERT_MIN = 10;
const SHOW_MS = 30000;
const SEEN_KEY = "bi.alerts.seen"; // which alerts this device has already shown

const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; } };
const markSeen = (id) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen().filter((x) => x !== id), id].slice(-12))); } catch { /* private mode */ } };

export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [1175, 0.18]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* sound is a bonus: browsers may refuse it until the page has been tapped */ }
}

// Which alert, if any, is due right now. Exported so it can be checked on its own.
export function dueAlert(nowMs, prefs = { war: true, hsb: true, warMin: WAR_ALERT_MIN, hsbMin: HSB_ALERT_MIN }) {
  const hsb = hsbStatus(nowMs);
  if (prefs.hsb && hsb.phase !== "live" && hsb.left <= prefs.hsbMin * 60000) {
    return { id: `hsb:${hsb.startsAt}`, kind: "hsb", at: hsb.startsAt, title: `HSB opens in ${Math.max(1, Math.ceil(hsb.left / 60000))} minutes`, body: `It opens at ${localTime(hsb.startsAt)} your time and runs for three hours.` };
  }
  const war = warStatus(nowMs);
  const toGate = war.nextGate - nowMs;
  if (prefs.war && toGate > 0 && toGate <= prefs.warMin * 60000) {
    return { id: `war:${war.nextGate}`, kind: "war", at: war.nextGate, title: `War in ${Math.max(1, Math.ceil(toGate / 60000))} minutes`, body: `The entrance opens at ${localTime(war.nextGate)} your time. Get ready.` };
  }
  return null;
}

export default function EventAlerts() {
  const [alert, setAlert] = useState(null);
  const [perm, setPerm] = useState(devicePermission());
  const hide = useRef(null);

  useEffect(() => {
    const show = (due, prefs, quiet) => {
      setAlert(due);
      if (prefs.sound) chime();
      if (prefs.device && !quiet) deviceNotify(`BLACKLIST INTROBOYS: ${due.title}`, due.body, due.id);
      clearTimeout(hide.current);
      hide.current = setTimeout(() => setAlert(null), SHOW_MS);
    };
    const check = () => {
      const prefs = getAlertPrefs();
      const due = dueAlert(Date.now(), prefs);
      if (!due || seen().includes(due.id)) return;
      markSeen(due.id); // once per event, on this device, even with several tabs open
      show(due, prefs);
    };
    // The Test buttons in the notification settings send one through the very same path.
    const onTest = (e) => {
      const kind = e.detail === "hsb" ? "hsb" : "war";
      show(kind === "war"
        ? { id: "test-war", kind, title: "Test: war alert", body: "This is how the war alert looks and sounds." }
        : { id: "test-hsb", kind, title: "Test: HSB alert", body: "This is how the HSB alert looks and sounds." }, getAlertPrefs(), true);
    };
    check();
    const t = setInterval(check, 5000);
    window.addEventListener("bi:alert-test", onTest);
    return () => { clearInterval(t); clearTimeout(hide.current); window.removeEventListener("bi:alert-test", onTest); };
  }, []);

  if (!alert) return null;
  const Icon = alert.kind === "war" ? Swords : Flame;
  const ask = async () => setPerm(await askDevicePermission());
  return (
    <div role="alert" data-event-alert={alert.kind} className="fixed inset-x-0 top-2 z-[60] mx-auto w-[min(94vw,26rem)] rounded-md border border-crimson bg-[hsl(0_0%_7%)] p-3 shadow-[0_10px_30px_-8px_rgba(200,22,29,0.8)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crimson text-white ember-pulse"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-bold uppercase tracking-wide text-white">{alert.title}</p>
          <p className="text-sm text-mist">{alert.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {alert.kind === "war" && <Link to="/guide?page=outpost-war" onClick={() => setAlert(null)} className="btn-bronze h-8 px-3 text-xs">War guide</Link>}
            {perm === "default" && (
              <button type="button" onClick={ask} className="btn-bronze h-8 px-3 text-xs"><Bell className="h-3.5 w-3.5" aria-hidden="true" /> Also notify me outside this page</button>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setAlert(null)} aria-label="Dismiss" className="shrink-0 rounded p-1 text-mist hover:text-white"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
