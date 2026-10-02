import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Avatar from "@/components/Avatar";
import { Ingot } from "@/components/SealLogo";
import WagerInput from "./WagerInput";
import Coin, { SIDES, sideName, landOn } from "./Coin";
import { useGuild, errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const SPIN_MS = 1800;
const POLL_MS = 5000;
const other = (side) => (side === "heads" ? "tails" : "heads");

// 1v1 coin duels: post a challenge, another member matches the stake, winner takes both.
export default function CoinDuels({ settings, balance }) {
  const { account, setBalance, reload } = useGuild();
  const myId = account && account.member ? account.member.id : "";
  const cap = settings.duel_max_wager > 0 ? settings.duel_max_wager : settings.max_bet;
  const [wager, setWager] = useState(settings.min_bet);
  const [side, setSide] = useState("heads");
  const [open, setOpen] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [show, setShow] = useState(null); // { duel, won } once the coin has landed
  const mineOpen = useRef(new Set());
  const shown = useRef(new Set());
  const timer = useRef(null);

  const flip = useCallback(
    (duel) => {
      if (shown.current.has(duel.id)) return;
      shown.current.add(duel.id);
      setShow(null);
      setSpinning(true);
      setRotation((r) => landOn(r, duel.result_side));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setSpinning(false);
        setShow({ duel, won: duel.winner_id === myId });
        reload();
      }, SPIN_MS);
    },
    [myId, reload]
  );

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("duelAction", { action: "list" });
      const d = res.data || {};
      setOpen(d.open || []);
      setRecent(d.recent || []);
      // One of my open challenges was just taken: play the toss for me too.
      const taken = (d.recent || []).find((x) => x.creator_id === myId && mineOpen.current.has(x.id));
      mineOpen.current = new Set((d.open || []).filter((x) => x.creator_id === myId).map((x) => x.id));
      if (taken) flip(taken);
    } catch (e) {
      setOpen((o) => o || []);
      setError(errorText(e, "Couldn't load the duels."));
    }
  }, [myId, flip]);

  useEffect(() => {
    load();
    let unsub = () => {};
    try {
      unsub = base44.entities.CoinDuel.subscribe(() => load());
    } catch {
      /* polling covers it */
    }
    const poll = setInterval(load, POLL_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(timer.current);
      unsub && unsub();
    };
  }, [load]);

  const run = async (key, payload, after) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      const res = await base44.functions.invoke("duelAction", payload);
      after && after(res.data);
      await load();
    } catch (e) {
      setError(errorText(e, "That didn't work. Try again."));
      load();
    } finally {
      setBusy("");
    }
  };

  const create = () => run("create", { action: "create", wager, side }, () => setBalance(balance - wager));
  const cancel = (d) => run(d.id, { action: "cancel", id: d.id }, () => reload());
  const accept = (d) => run(d.id, { action: "accept", id: d.id }, (data) => flip(data.duel));

  const canCreate = wager >= settings.min_bet && wager <= cap && wager <= balance;
  const myOpenCount = (open || []).filter((d) => d.creator_id === myId).length;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "relative flex h-48 items-center justify-center rounded-md border border-bronze/40 bg-[radial-gradient(circle_at_50%_40%,hsl(205_35%_16%),hsl(192_26%_6%))]",
          show && (show.won ? "win-glow" : "loss-shake")
        )}
        style={{ perspective: 800 }}
      >
        <Coin rotation={rotation} spinMs={SPIN_MS} spinning={spinning} size={112} />
        <p className="absolute bottom-2 px-3 text-center text-sm text-mist" aria-live="polite">
          {spinning
            ? "The coin is in the air"
            : show
              ? <>Landed on <b className="text-gold">{sideName(show.duel.result_side)}</b>. <span className={show.won ? "font-bold text-jade" : "font-bold text-ember"}>{show.won ? `You win ${(show.duel.wager * 2).toLocaleString()} points!` : `${show.duel.winner_name} takes the pot.`}</span></>
              : "Winner takes both stakes. No house cut."}
        </p>
      </div>

      {/* post a challenge */}
      <div className="space-y-3">
        <div>
          <p className="label">Your call</p>
          <div className="grid grid-cols-2 gap-2">
            {SIDES.map((s) => (
              <button key={s.id} type="button" data-on={side === s.id} aria-pressed={side === s.id} onClick={() => setSide(s.id)} className="btn-bronze h-11 text-base">
                <span className="font-heading text-lg" lang="zh-Hant">{s.glyph}</span> {s.name}
              </button>
            ))}
          </div>
        </div>
        <WagerInput wager={wager} setWager={setWager} minBet={settings.min_bet} maxBet={cap} balance={balance} disabled={busy === "create"} />
        <button onClick={create} disabled={!!busy || !canCreate || myOpenCount >= 3} className="btn-seal h-12 w-full text-base">
          {busy === "create" ? <><Loader2 className="h-4 w-4 animate-spin" /> Posting</> : `Post a ${wager.toLocaleString()}-point challenge`}
        </button>
        <p className="text-xs text-mist/80">
          {myOpenCount >= 3
            ? "You have 3 open challenges. Cancel one to post another."
            : "Your stake is held until someone accepts. Unanswered challenges are refunded after 30 minutes."}
        </p>
      </div>

      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

      {/* open challenges */}
      <div>
        <p className="label">Open challenges</p>
        {open === null ? (
          <p className="flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-mist">No open challenges. Post one and call out the guild.</p>
        ) : (
          <ul className="space-y-2">
            {open.map((d) => {
              const mine = d.creator_id === myId;
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-md border border-bronze/40 bg-black/20 px-3 py-2">
                  <Avatar url={d.creator_avatar} name={d.creator_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{d.creator_name}{mine ? " (you)" : ""}</p>
                    <p className="text-xs text-mist">
                      Calls {sideName(d.creator_side)}{mine ? "" : `, you get ${sideName(other(d.creator_side))}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 font-heading font-bold text-gold tabular-nums"><Ingot size={14} />{d.wager.toLocaleString()}</span>
                  {mine ? (
                    <button onClick={() => cancel(d)} disabled={!!busy} className="btn-bronze h-9 px-3 text-sm">
                      {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                    </button>
                  ) : (
                    <button onClick={() => accept(d)} disabled={!!busy || d.wager > balance} title={d.wager > balance ? "Not enough points" : undefined} className="btn-seal h-9 px-3 text-sm">
                      {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <p className="label">Recent duels</p>
          <ul className="space-y-1.5 text-sm">
            {recent.slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-mist">
                  <b className="text-[hsl(var(--foreground))]">{d.winner_name}</b> beat {d.winner_id === d.creator_id ? d.acceptor_name : d.creator_name} on {sideName(d.result_side)}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-jade">+{d.wager.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}