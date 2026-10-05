import React, { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";

export const SITE_VERSION = "5.1";
const CHECKS = [
  { fn: "getMyAccount", label: "Accounts and ranks" },
  { fn: "playGame", label: "Toss, dice, slots and wheel" },
  { fn: "rouletteAction", label: "Live roulette" },
  { fn: "sicboAction", label: "Live Dragon Sic Bo" },
  { fn: "wheelAction", label: "Live Twelve Skies Wheel" },
  { fn: "blackjackAction", label: "Blackjack table" },
  { fn: "lucky9Action", label: "Lucky 9 table" },
  { fn: "pusoyAction", label: "Pusoy Dos tables" },
  { fn: "duelAction", label: "Coin duels" },
  { fn: "shopAction", label: "Guild shop" },
  { fn: "raffleAction", label: "Raffle" },
  { fn: "chatSend", label: "Chat" },
  { fn: "chatBridge", label: "Discord chat bridge" },
  { fn: "adminAction", label: "Admin tools" }
];

// Asks each backend function which version it is running. A game that "does
// nothing" is almost always a function that wasn't published with the site.
export default function SystemCheck() {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    // One at a time: asking all of them at once trips the rate limit.
    const out = [];
    for (const c of CHECKS) {
      let row;
      for (let attempt = 0; attempt < 3 && !row; attempt++) {
        try {
          const res = await base44.functions.invoke(c.fn, { action: "ping" });
          const v = res.data && res.data.version;
          row = v === SITE_VERSION
            ? { ...c, ok: true, note: `Up to date (${v})` }
            : { ...c, ok: false, note: v ? `Running version ${v}, the site needs ${SITE_VERSION}` : "Running an older version" };
        } catch (e) {
          const status = e && e.response && e.response.status;
          const text = errorText(e, "no reply");
          const limited = status === 429 || /rate limit/i.test(text);
          if (limited && attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          row = { ...c, ok: false, note: limited ? "Too many requests right now. Wait a minute and check again." : status === 404 ? "Not published yet" : `Older version or not published (${text})` };
        }
      }
      out.push(row);
      setRows([...out]);
      await new Promise((r) => setTimeout(r, 300));
    }
    setRows(out);
    setRunning(false);
  };

  const bad = rows ? rows.filter((r) => !r.ok).length : 0;

  return (
    <Panel title="System check">
      <p className="text-sm text-mist">Checks that every backend function matches this version of the site. Run it after each publish, or when a game stops responding.</p>
      <button onClick={run} disabled={running} className="btn-bronze mt-3 h-10 px-5 text-sm">
        {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking</> : rows ? "Check again" : "Run the check"}
      </button>
      {rows && (
        <>
          <ul className="mt-4 divide-y divide-bronze/25">
            {rows.map((r) => (
              <li key={r.fn} className="flex items-center gap-3 py-2 text-sm">
                {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-jade" /> : <XCircle className="h-4 w-4 shrink-0 text-ember" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{r.label}</span>
                  <span className="block break-words text-xs text-mist">{r.fn} · {r.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p role="status" className={bad ? "mt-3 text-sm text-ember" : "mt-3 text-sm text-jade"}>
            {bad
              ? `${bad} function${bad > 1 ? "s are" : " is"} out of date. Push the whole project (including the base44 folder) and publish again from the Base44 dashboard, then re-run this check.`
              : "Everything is published and up to date."}
          </p>
        </>
      )}
    </Panel>
  );
}