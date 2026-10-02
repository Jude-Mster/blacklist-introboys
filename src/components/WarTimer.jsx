import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Swords } from "lucide-react";
import { warStatus, clock, localTime } from "@/lib/war";
import { cn } from "@/lib/utils";

const TEXT = {
  waiting: { label: "Next war", tone: "border-bronze text-white", dot: "bg-mist" },
  countdown: { label: "War soon", tone: "border-[#E0474D] text-white", dot: "bg-[#FF6B70] ember-pulse" },
  gate: { label: "Entrance open", tone: "border-crimson bg-crimson text-white", dot: "bg-white ember-pulse" },
  battle: { label: "War live", tone: "border-crimson bg-crimson text-white", dot: "bg-white ember-pulse" }
};

// Live Regular Battle clock. `variant="chip"` for the top bar, `variant="strip"`
// for a full-width row on phones. Links to the war page of the game guide.
export default function WarTimer({ variant = "chip", className }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const s = warStatus(now);
  const t = TEXT[s.phase];
  const time = clock(s.left);
  const detail =
    s.phase === "battle" ? `${time} left` : s.phase === "gate" ? `battle in ${time}` : `in ${time}`;
  const title =
    s.phase === "battle"
      ? "Regular Battle is being fought now"
      : s.phase === "gate"
        ? "The entrance is open. Get in before the battle starts."
        : `Entrance opens at ${localTime(s.nextGate)} your time`;

  return (
    <Link
      to="/guide?page=outpost-war"
      title={title}
      aria-label={`Regular Battle: ${t.label}, ${detail}. Open the war guide.`}
      className={cn(
        "items-center gap-2 rounded border font-heading text-sm font-semibold uppercase tracking-wide transition-[filter] hover:brightness-125",
        variant === "strip" ? "flex w-full justify-center px-3 py-2" : "inline-flex h-9 shrink-0 px-2.5",
        t.tone,
        className
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} aria-hidden="true" />
      <Swords className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{t.label}</span>
      <span className="whitespace-nowrap tabular-nums normal-case opacity-90">{detail}</span>
      {variant === "strip" && s.phase === "waiting" && (
        <span className="whitespace-nowrap text-xs font-normal normal-case text-mist">· {localTime(s.nextGate)}</span>
      )}
    </Link>
  );
}