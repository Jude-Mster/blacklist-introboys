import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import LanternSpinner from "@/components/LanternSpinner";
import WarTimer from "@/components/WarTimer";
import { useGuild } from "@/lib/GuildContext";
import { WAR, warStatus, localTime } from "@/lib/war";
import { cn } from "@/lib/utils";

const WIKI = "https://wiki.wuxen2.com/";
// Sections of the official Wuxen2 wiki.
const PAGES = [
  { id: "outpost-war", label: "Regular Battle" },
  { id: "boxes", label: "Boxes" },
  { id: "monsters", label: "Monsters" },
  { id: "enhance", label: "Enhance" },
  { id: "wing-enhance", label: "Wing Enhance" },
  { id: "upgrade", label: "Upgrade / Downgrade" },
  { id: "combine", label: "Combine" },
  { id: "premium", label: "Premium" },
  { id: "battle-pass", label: "Battle Pass" },
  { id: "daily-quest", label: "Daily Quest" },
  { id: "login-reward", label: "Monthly Login Reward" },
  { id: "mount", label: "Mount" },
  { id: "pet", label: "Pets" },
  { id: "golden-charm", label: "Gold Plate Scroll" },
  { id: "outpost-capture", label: "Dragonfall Outpost" },
  { id: "highland-capture", label: "Highlands" },
  { id: "title", label: "Title" },
  { id: "halo", label: "Halo" },
  { id: "costume", label: "Costume" }
];

// The official Wuxen2 wiki, shown inside the guild site, with the live war clock on top.
export default function Guide() {
  const { account, loading } = useGuild();
  const [params, setParams] = useSearchParams();
  if (loading) return <LanternSpinner label="Opening the guide" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const current = PAGES.find((p) => p.id === params.get("page")) || PAGES[0];
  const url = `${WIKI}#${current.id}`;
  const s = warStatus();
  const gate = s.nextGate;
  const min = 60000;

  return (
    <div className="mx-auto max-w-[72rem] space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl gilt-text">Game guide</h1>
          <p className="mt-1 text-sm text-mist">The official Wuxen2 wiki, inside the guild hall.</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-bronze h-10 px-4 text-sm">
          Open the wiki in a new tab <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </header>

      <section className="gw p-4" aria-label="War schedule">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <WarTimer />
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Time label="Countdown" value={localTime(gate - (WAR.gateMin - WAR.countdownMin) * min)} />
            <Time label="Entrance opens" value={localTime(gate)} />
            <Time label="Battle" value={`${localTime(gate + (WAR.battleMin - WAR.gateMin) * min)} to ${localTime(gate + (WAR.endMin - WAR.gateMin) * min)}`} />
          </dl>
        </div>
        <p className="mt-2 text-xs text-mist/80">Regular Battle runs every hour. Times are for the next war, shown in your own time zone.</p>
      </section>

      <div role="tablist" aria-label="Guide sections" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {PAGES.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === current.id}
            data-on={p.id === current.id}
            onClick={() => setParams({ page: p.id }, { replace: true })}
            className={cn("btn-bronze h-9 shrink-0 px-3 text-sm")}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="gw overflow-hidden">
        <iframe
          key={current.id}
          src={url}
          title={`Wuxen2 wiki: ${current.label}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="block h-[75vh] min-h-[32rem] w-full border-0 bg-black"
        />
      </div>
      <p className="text-xs text-mist/80">
        Content © Wuxen2, shown from wiki.wuxen2.com. If the guide looks blank, use the button above to open it in a new tab.
      </p>
    </div>
  );
}

function Time({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-mist">{label}</dt>
      <dd className="font-heading font-semibold text-white tabular-nums">{value}</dd>
    </div>
  );
}