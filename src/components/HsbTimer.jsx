import React, { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { hsbStatus, longClock, localDayTime } from "@/lib/hsb";
import { cn } from "@/lib/utils";

const TEXT = {
  waiting: { label: "Next HSB", tone: "border-bronze text-white", dot: "bg-mist" },
  soon: { label: "HSB soon", tone: "border-[#E0474D] text-white", dot: "bg-[#FF6B70] ember-pulse" },
  live: { label: "HSB live", tone: "border-crimson bg-crimson text-white", dot: "bg-white ember-pulse" }
};

// Live HSB clock, a twin of the war timer. `variant="chip"` for the top bar,
// `variant="strip"` for a full-width row on phones. The schedule is in src/lib/hsb.js.
export default function HsbTimer({ variant = "chip", className }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const s = hsbStatus(now);
  const t = TEXT[s.phase];
  const time = longClock(s.left);
  const detail = s.phase === "live" ? `${time} left` : `in ${time}`;
  const title = s.phase === "live"
    ? `HSB is open now. It closes at ${localDayTime(s.endsAt)} your time.`
    : `HSB opens ${localDayTime(s.startsAt)} your time. Every Wednesday 16:00 to 19:00 and Saturday 10:00 to 13:00 server time (UTC).`;

  return (
    <div
      title={title}
      role="timer"
      aria-label={`HSB: ${t.label}, ${detail}. ${title}`}
      className={cn(
        "items-center gap-2 rounded border font-heading text-sm font-semibold uppercase tracking-wide",
        variant === "strip" ? "flex w-full justify-center px-3 py-2" : "inline-flex h-9 shrink-0 px-2.5",
        t.tone,
        className
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} aria-hidden="true" />
      <Flame className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{t.label}</span>
      <span className="whitespace-nowrap tabular-nums normal-case opacity-90">{detail}</span>
      {variant === "strip" && s.phase !== "live" && (
        <span className="whitespace-nowrap text-xs font-normal normal-case text-mist">· {localDayTime(s.startsAt)}</span>
      )}
    </div>
  );
}
