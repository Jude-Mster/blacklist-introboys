import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Undo2, RotateCcw, Repeat, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import { Ingot } from "@/components/SealLogo";
import Wheel, { angleFor } from "./Wheel";
import { useGuild, errorText } from "@/lib/GuildContext";
import { ROULETTE_POCKETS, ROULETTE_RETURNS, ROULETTE_SPOTS, pocketColor, rouletteWins } from "@/lib/games";
import { cn } from "@/lib/utils";

const SPIN_MS = 5000;
const POLL_MS = 2500;
const COLORS = { red: "#C8161D", black: "#141414", green: "#12A150" };
const GLYPH = { dragon: "龍", tiger: "虎" };
const POCKET_NAME = { red: "Red", black: "Black", green: "Green", dragon: "the Dragon", tiger: "the Tiger" };
// The single green pocket is the 14x one: bright green, gold edge, and its prize written on it.
// Dragon and Tiger pockets show their sign in gold.
const SEGMENTS = ROULETTE_POCKETS.map((k) =>
  k === "green"
    ? { label: "14×", color: COLORS.green, fontSize: 11, textColor: "#FFE9A3", stroke: "#F5C542" }
    : { label: GLYPH[k] || "", color: COLORS[pocketColor(k)], fontSize: 13, textColor: GLYPH[k] ? "#FFD966" : "#FFFFFF" }
);
const CHIP_VALUES = [10, 50, 100, 500, 1000, 5000];
const short = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));

// One shared table for the whole guild. The server runs the rounds on a timer:
// betting -> spin -> result -> next round. Everyone sees the same wheel.
// Guild rules: Red 2x, Black 2x, Green 14x, Dragon (a red pocket) 7x, Tiger (a black pocket) 7x.
export default function Roulette({ settings, balance }) {
  const { setBalance, reload } = useGuild();
  const chips = useMemo(() => CHIP_VALUES.filter((v) => v <= settings.max_bet), [settings.max_bet]);
  const [chip, setChip] = useState(chips[Math.min(1, chips.length - 1)] || settings.min_bet);
  const [state, setState] = useState(null); // { table, bets, mine }
  const [offset, setOffset] = useState(0); // server clock minus this device's clock
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState([]); // chips not sent yet: [{ type, amount }]
  const [history, setHistory] = useState([]);
  const [lastBets, setLastBets] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(0); // round whose result is on show
  const seenBetting = useRef(0);
  const animated = useRef(0);
  const inFlight = useRef(false);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await base44.functions.invoke("rouletteAction", { action: "state" });
      const d = res.data;
      if (d && d.table) {
        setOffset(Date.parse(d.table.server_now) - Date.now());
        loaded.current = true;
        setState(d);
        setLoadError("");
      }
    } catch (e) {
      // A missed background refresh isn't worth an error once the table is showing.
      if (!loaded.current && !(e && e.rateLimited)) setLoadError(errorText(e, "Couldn't reach the roulette table."));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const table = state && state.table;
  const round = table ? table.round_no : 0;
  const serverNow = now + offset;

  // Run the wheel when a round we watched gets its pocket.
  useEffect(() => {
    if (!table) return;
    if (table.status === "betting") {
      seenBetting.current = table.round_no;
      return;
    }
    if (table.result_number === null || table.result_number === undefined) return;
    if (animated.current === table.round_no) return;
    animated.current = table.round_no;
    const fresh = seenBetting.current === table.round_no || Date.now() + offset - Date.parse(table.settled_at) < 4000;
    if (!fresh) {
      // Arrived after the spin: show the pocket without the show.
      setRotation((r) => angleFor(table.result_number, r, ROULETTE_POCKETS.length, 0));
      setRevealed(table.round_no);
      return;
    }
    setSpinning(true);
    setRotation((r) => angleFor(table.result_number, r, ROULETTE_POCKETS.length, 6));
    const t = setTimeout(() => {
      setSpinning(false);
      setRevealed(table.round_no);
      reload(); // points only change once the wheel has stopped
    }, SPIN_MS + 100);
    return () => {
      clearTimeout(t);
      setSpinning(false);
      animated.current = 0;
    };
  }, [table && table.round_no, table && table.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // New round: clear the chips that were waiting to go down.
  useEffect(() => {
    setPending([]);
    setHistory([]);
    setError("");
  }, [round]);
  useEffect(() => {
    if (state && state.mine && state.mine.bets && state.mine.bets.length) setLastBets(state.mine.bets.map((b) => ({ type: b.type, amount: b.amount })));
  }, [state]);

  const betting = !!table && table.status === "betting";
  const closeIn = betting ? Math.max(0, Math.ceil((Date.parse(table.bets_close_at) - serverNow) / 1000)) : 0;
  const open = betting && Date.parse(table.bets_close_at) - serverNow > 1500;
  const showResult = !!table && table.status === "settled" && revealed === table.round_no && !!table.result_kind;
  const nextIn = table && table.status === "settled" && table.next_at ? Math.max(0, Math.ceil((Date.parse(table.next_at) - serverNow) / 1000)) : 0;
  const betSeconds = 10; // must match BET_SECONDS in rouletteAction

  const mine = (state && state.mine) || null;
  const placed = useMemo(() => (mine && mine.round_no === round ? mine.bets || [] : []), [mine, round]);
  const placedTotal = placed.reduce((t, b) => t + b.amount, 0);
  const pendingTotal = pending.reduce((t, b) => t + b.amount, 0);
  const pendingOn = (type) => (pending.find((b) => b.type === type) || { amount: 0 }).amount;
  const kind = showResult ? table.result_kind : null;

  const place = (type) => {
    if (!open || placing) return;
    if (pendingTotal + chip > balance || placedTotal + pendingTotal + chip > settings.max_bet) {
      setError(pendingTotal + chip > balance ? "Not enough points for another chip." : `You can bet up to ${settings.max_bet.toLocaleString()} per spin.`);
      return;
    }
    setError("");
    setHistory((h) => [...h, pending]);
    setPending((bs) => (bs.some((b) => b.type === type) ? bs.map((b) => (b.type === type ? { ...b, amount: b.amount + chip } : b)) : [...bs, { type, amount: chip }]));
  };
  const undo = () => {
    setPending(history[history.length - 1] || []);
    setHistory((h) => h.slice(0, -1));
  };
  const clear = () => {
    setHistory((h) => [...h, pending]);
    setPending([]);
  };
  const rebet = () => {
    if (!lastBets) return;
    const total = lastBets.reduce((t, b) => t + b.amount, 0);
    if (total > balance || placedTotal + total > settings.max_bet) {
      setError("Not enough room to repeat those bets.");
      return;
    }
    setHistory((h) => [...h, pending]);
    setPending(lastBets.map((b) => ({ ...b })));
  };
  const submit = async () => {
    if (!pending.length || placing) return;
    setPlacing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("rouletteAction", { action: "bet", bets: pending });
      setBalance(res.data.balance);
      setPending([]);
      setHistory([]);
      setState((s) => (s ? { ...s, mine: res.data.mine } : s));
      refresh();
    } catch (e) {
      setError(errorText(e, "Those chips didn't go down. Try again."));
    } finally {
      setPlacing(false);
    }
  };

  if (!table) {
    return (
      <Panel title="Blacklist Jade Roulette">
        {loadError ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-sm text-ember">{loadError}</p>
            <button onClick={refresh} className="btn-bronze mx-auto mt-4 h-10 px-5 text-sm">Try again</button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Finding the table</p>
        )}
      </Panel>
    );
  }

  const players = (state.bets || []).slice().sort((a, b) => b.amount - a.amount);
  const myRow = players.find((p) => p.mine);
  const myNet = showResult && myRow && myRow.settled ? myRow.net : null;
  // Everyone's chips, grouped by the spot they sit on.
  const chipsOn = (type) => players.flatMap((p) => (p.spots || []).filter((c) => c.type === type).map((c) => ({ name: p.name, avatar: p.avatar, mine: p.mine, amount: c.amount }))).sort((a, b) => b.amount - a.amount);
  const recent = table.recent.slice(showResult || table.status === "betting" ? 0 : 1);

  const renderSpot = (spot, tall) => {
    const all = chipsOn(spot.id);
    const waiting = pendingOn(spot.id);
    const total = all.reduce((t, c) => t + c.amount, 0);
    const hit = kind !== null && rouletteWins(spot.id, kind);
    const shown = all.slice(0, 5);
    return (
      <button
        key={spot.id}
        type="button"
        onClick={() => place(spot.id)}
        disabled={!open}
        aria-label={`Bet on ${spot.name}, returns ${ROULETTE_RETURNS[spot.id]} times${total + waiting ? `, ${total + waiting} on it` : ""}`}
        className={cn(
          "relative flex flex-col items-stretch rounded-md border-2 p-2 text-left transition-[filter,opacity] enabled:hover:brightness-125 disabled:cursor-default",
          tall ? "min-h-[132px]" : "min-h-[116px]",
          hit ? "border-gold win-glow" : "border-bronze/50",
          kind !== null && !hit && "opacity-45"
        )}
        style={{ background: `linear-gradient(160deg, ${COLORS[spot.color]}, ${COLORS[spot.color]}cc 55%, #0a0a0a)` }}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-heading text-sm font-extrabold leading-none text-[hsl(0_0%_95%)]">
              {spot.glyph && <span lang="zh-Hant" className="text-base leading-none" aria-hidden="true">{spot.glyph}</span>}
              {spot.name}
            </span>
            {spot.note && <span className="mt-0.5 block text-[10px] leading-tight text-[hsl(0_0%_90%/0.75)]">{spot.note}</span>}
          </span>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-heading font-extrabold", spot.id === "green" ? "bg-gold text-base text-black" : "bg-black/45 text-sm text-gold")}>{ROULETTE_RETURNS[spot.id]}×</span>
        </span>

        {/* the coins on this spot, biggest first */}
        <span className="mt-2 flex flex-1 flex-wrap content-start gap-1">
          {waiting > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-dashed border-gold bg-black/60 py-0.5 pl-0.5 pr-1.5 text-[11px] font-bold text-gold">
              <Ingot size={14} /> +{short(waiting)}
            </span>
          )}
          {shown.map((c, i) => (
            <span key={i} className={cn("flex items-center gap-1 rounded-full bg-black/60 py-0.5 pl-0.5 pr-1.5 text-[11px] font-bold", c.mine ? "border border-gold text-gold" : "border border-transparent text-[hsl(0_0%_92%)]")} title={`${c.mine ? "You" : c.name}: ${c.amount.toLocaleString()}`}>
              <span className="relative flex">
                <Ingot size={14} />
                <Avatar url={c.avatar} name={c.name} size={14} className="-ml-1.5" />
              </span>
              {short(c.amount)}
            </span>
          ))}
          {all.length > shown.length && <span className="self-center text-[11px] text-[hsl(0_0%_90%/0.8)]">+{all.length - shown.length} more</span>}
        </span>

        <span className="mt-1 flex items-center justify-between text-[11px] text-[hsl(0_0%_90%/0.8)]">
          <span>{all.length} {all.length === 1 ? "bet" : "bets"}</span>
          <span className="flex items-center gap-1 font-bold tabular-nums"><Ingot size={11} /> {total.toLocaleString()}</span>
        </span>
      </button>
    );
  };
  const spot = (id) => ROULETTE_SPOTS.find((s) => s.id === id);

  return (
    <Panel title="Blacklist Jade Roulette">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-mist">Round {round.toLocaleString()}</span>
        <span className="flex items-center gap-1.5 text-mist"><Users className="h-4 w-4" aria-hidden="true" /> {players.length} at the table</span>
      </div>
      <div
        className={cn(
          "mb-4 rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_45%,hsl(0_0%_9%),hsl(0_0%_6%))] py-4",
          myNet !== null && (myNet > 0 ? "win-glow" : myNet < 0 ? "loss-shake" : "")
        )}
      >
        <Wheel segments={SEGMENTS} rotation={rotation} spinMs={SPIN_MS} spinning={spinning} size={250} highlight={showResult ? table.result_number : null} flat hub="黑" />
        {/* what each pocket pays */}
        <ul className="mx-auto mt-3 flex max-w-[330px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 text-xs text-mist" aria-label="What each pocket pays">
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS.red }} /> Red <b className="text-gold">2×</b></li>
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-white/30" style={{ background: COLORS.black }} /> Black <b className="text-gold">2×</b></li>
          <li className="flex items-center gap-1"><span lang="zh-Hant" className="flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold text-[#FFD966]" style={{ background: COLORS.red }}>龍</span> Dragon <b className="text-gold">7×</b></li>
          <li className="flex items-center gap-1"><span lang="zh-Hant" className="flex h-4 w-4 items-center justify-center rounded-sm border border-white/30 text-[10px] font-bold text-[#FFD966]" style={{ background: COLORS.black }}>虎</span> Tiger <b className="text-gold">7×</b></li>
          <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm ring-1 ring-gold" style={{ background: COLORS.green }} /> Green <b className="text-gold">14×</b></li>
        </ul>
        <div className="mt-3 px-4 text-center" aria-live="polite">
          {betting && open && (
            <>
              <p className="text-sm text-mist">
                Bets close in <span className="font-heading text-xl font-extrabold text-gold tabular-nums">{closeIn}</span> s
              </p>
              <div className="mx-auto mt-2 h-1.5 max-w-[220px] overflow-hidden rounded-full bg-black/50">
                <div className="h-full bg-gold/80 transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (closeIn / betSeconds) * 100)}%` }} />
              </div>
            </>
          )}
          {((betting && !open) || spinning) && <p className="font-heading text-base font-bold text-gold">No more bets. The wheel is turning.</p>}
          {showResult && !spinning && (
            <p className="text-sm text-mist">
              Landed on{" "}
              <span className="rounded px-2 py-0.5 font-heading text-base font-extrabold text-[hsl(0_0%_95%)]" style={{ background: COLORS[pocketColor(kind)] }}>
                {GLYPH[kind] ? <span lang="zh-Hant" className="mr-1">{GLYPH[kind]}</span> : null}
                {POCKET_NAME[kind]}
              </span>
              <span className="ml-2">Next spin in {nextIn} s</span>
            </p>
          )}
        </div>
      </div>

      {myNet !== null && (
        <p className={cn("mb-3 text-center font-heading text-lg font-bold", myNet >= 0 ? "text-jade" : "text-ember")} aria-live="polite">
          {myNet > 0 ? `Victory! +${myNet.toLocaleString()} points` : myNet === 0 ? "You broke even." : `Defeat. −${Math.abs(myNet).toLocaleString()} points`}
        </p>
      )}

      {recent.length > 0 && (
        <div className="mb-4 flex items-center gap-1.5 overflow-hidden" aria-label="Recent results, newest first">
          <span className="shrink-0 text-xs text-mist">Last</span>
          {recent.map((k, i) => (
            <span
              key={`${k}-${i}`}
              title={POCKET_NAME[k]}
              lang={GLYPH[k] ? "zh-Hant" : undefined}
              className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px] font-bold text-[hsl(0_0%_95%)]", i === 0 && "ring-1 ring-gold")}
              style={{ background: COLORS[pocketColor(k)] }}
            >
              {GLYPH[k] || ""}
            </span>
          ))}
        </div>
      )}

      {/* chip picker */}
      <p className="label">Chip value</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setChip(v)}
            aria-pressed={chip === v}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed text-xs font-bold transition-transform",
              chip === v ? "scale-110 border-gold bg-crimson text-[hsl(0_0%_92%)]" : "border-bronze/70 bg-black/40 text-gold"
            )}
          >
            {short(v)}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs text-mist">Tap a spot to put the chosen chip on it. You can bet on as many spots as you like, tap again to add more, and keep adding until bets close.</p>
      {/* the table: tap a spot to put the chosen chip on it */}
      <div className="select-none space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {renderSpot(spot("red"), true)}
          {renderSpot(spot("green"), true)}
          {renderSpot(spot("black"), true)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {renderSpot(spot("dragon"), false)}
          {renderSpot(spot("tiger"), false)}
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={undo} disabled={!history.length || placing} className="btn-bronze h-10 px-3 text-sm"><Undo2 className="h-4 w-4" aria-hidden="true" /> Undo</button>
        <button type="button" onClick={clear} disabled={!pending.length || placing} className="btn-bronze h-10 px-3 text-sm"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Clear</button>
        <button type="button" onClick={rebet} disabled={!lastBets || !open || placing} className="btn-bronze h-10 px-3 text-sm"><Repeat className="h-4 w-4" aria-hidden="true" /> Repeat</button>
        <p className="ml-auto flex items-center gap-1.5 text-sm text-mist">
          On the table <Ingot size={14} /> <span className="font-bold text-gold tabular-nums">{placedTotal.toLocaleString()}</span>
        </p>
      </div>
      <button type="button" onClick={submit} disabled={!pending.length || !open || placing} className="btn-seal mt-3 h-12 w-full text-base">
        {placing ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing</> : pending.length ? <>Place bets · <Ingot size={15} /> {pendingTotal.toLocaleString()}</> : open ? "Tap a spot to place a chip" : "Wait for the next round"}
      </button>

      {players.length > 0 && (
        <ul className="mt-4 divide-y divide-bronze/25 rounded-md border border-bronze/40 bg-black/20 px-3" aria-label="Players this round">
          {players.slice(0, 12).map((p, i) => (
            <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
              <Avatar url={p.avatar} name={p.name} size={22} />
              <span className={cn("min-w-0 flex-1 truncate", p.mine && "font-bold text-gold")}>{p.mine ? "You" : p.name}</span>
              <span className="flex items-center gap-1 text-mist tabular-nums"><Ingot size={12} /> {p.amount.toLocaleString()}</span>
              {showResult && p.settled && (
                <span className={cn("w-16 text-right font-heading font-bold tabular-nums", p.net > 0 ? "text-jade" : p.net < 0 ? "text-ember" : "text-mist")}>
                  {p.net > 0 ? "+" : ""}{p.net.toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-mist/80">
        The wheel has 25 pockets: 12 red, 12 black and 1 green. One red pocket carries the Dragon and one black pocket carries the Tiger. Red or Black returns 2× your chips, Green 14×, Dragon 7×, Tiger 7×. The Dragon pocket still counts as red and the Tiger pocket as black, so colour bets win on them too. You can bet on several spots in the same spin and keep adding until bets close after 10 seconds. Over time Red and Black return 96% of what is staked. Green, the Dragon and the Tiger are single pockets, so Green returns 56% and Dragon and Tiger 28%.
      </p>
    </Panel>
  );
}