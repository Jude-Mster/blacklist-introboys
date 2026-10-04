import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, LogOut, Coffee, Plus } from "lucide-react";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import LanternSpinner from "@/components/LanternSpinner";
import ChatBox from "@/components/chat/ChatBox";
import { Ingot } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import PlayingCard from "./PlayingCard";
import DealtCards, { Dealt } from "@/components/DealtCards";
import BuyIn from "./BuyIn";
import usePokerTable from "./usePokerTable";
import { cn } from "@/lib/utils";

const BETTING = ["preflop", "flop", "turn", "river"];
const ACTION_SECONDS = 25;
const PHASE_LABEL = { waiting: "Waiting for players", preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };
// Seat spots around the felt, starting with the viewer at the bottom and going clockwise.
const SPOTS = [
  [50, 89],
  [11, 70],
  [11, 29],
  [50, 7],
  [89, 29],
  [89, 70]
];

export default function PokerTableView({ tableId }) {
  const { account, reload } = useGuild();
  const { state, error, now, send } = usePokerTable(tableId);
  const [sitAt, setSitAt] = useState(null);

  // Community cards are turned over one at a time, even when the server deals several
  // at once (everyone all in). The result is held back until the last one is down.
  const BOARD_STEP_MS = 800;
  const live = state && state.table;
  const boardLen = live && live.board ? live.board.length : 0;
  const handNo = live ? live.hand_no : 0;
  const [shown, setShown] = useState(0);
  const shownHand = useRef(handNo);
  useEffect(() => {
    if (shownHand.current !== handNo) { shownHand.current = handNo; setShown(0); return undefined; }
    if (shown > boardLen) { setShown(boardLen); return undefined; }
    if (shown === boardLen) return undefined;
    const timer = setTimeout(() => setShown((n) => n + 1), BOARD_STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, boardLen, handNo]);

  if (!state) return <LanternSpinner label="Taking you to the table" className="py-24" />;
  const t = state.table;
  const mySeat = state.my_seat ?? -1;
  const seated = mySeat >= 0;
  const me = seated ? t.seats[mySeat] : null;
  const anchor = seated ? mySeat : 0;
  const pot = t.seats.reduce((a, s) => a + (s && s.in_hand ? s.committed || 0 : 0), 0);
  const dealing = Math.min(shown, boardLen) < boardLen; // cards still being turned over
  const result = t.phase === "showdown" && t.showdown && t.showdown.winners ? t.showdown : null;
  const winners = result && !dealing ? result.winners : [];
  const winnerSeats = new Set(winners.map((w) => w.seat));
  // Hands are only face up at a showdown, never during play.
  const revealed = (result && result.revealed) || {};
  // Until the last card is down, stacks are shown as they were before the pot was awarded.
  const notYetPaid = result && dealing ? Object.fromEntries(result.winners.map((w) => [w.seat, w.amount])) : {};
  const winningCards = new Set(winners.flatMap((w) => (revealed[w.seat] && revealed[w.seat].best) || []));
  const left = t.deadline ? Math.max(0, (Date.parse(t.deadline) - now) / 1000) : 0;
  const seatEmpty = (s) => !s || !s.member_id;

  const channels = [
    { id: `table:${t.id}`, label: "Table" },
    { id: "guild", label: "Guild" }
  ];

  return (
    <div className="mx-auto grid max-w-[64rem] gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/poker" className="flex items-center gap-1.5 text-sm text-mist hover:text-gold">
            <ArrowLeft className="h-4 w-4" /> Poker room
          </Link>
          <p className="text-right text-sm">
            <span className="font-heading font-bold text-gold">{t.name}</span>
            <span className="text-mist"> · blinds {t.small_blind}/{t.big_blind}</span>
          </p>
        </div>

        {/* the table */}
        <div className="relative mx-auto h-[430px] w-full max-w-[640px] sm:h-[460px]">
          <div
            className="absolute inset-x-[11%] inset-y-[12%] rounded-[50%] border-[6px] border-[hsl(0_0%_32%)]"
            style={{
              background: "radial-gradient(ellipse at 50% 40%, hsl(357 62% 24%), hsl(357 66% 13%) 70%, hsl(357 70% 7%))",
              boxShadow: "inset 0 0 0 2px hsl(0 0% 100% / 0.3), inset 0 0 50px rgba(0,0,0,0.6), 0 20px 50px -20px rgba(0,0,0,0.9)"
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center font-heading text-6xl font-extrabold text-black/15" aria-hidden="true">
              黑
            </span>
          </div>

          {/* centre: pot, board, status */}
          <div className="absolute inset-x-[16%] top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
            <p className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-0.5 text-sm font-bold text-gold">
              <Ingot size={14} /> {pot.toLocaleString()}
            </p>
            <div className="flex gap-1" aria-label="Community cards">
              {[0, 1, 2, 3, 4].map((i) =>
                t.board && t.board[i] && i < shown ? (
                  <span key={i} className="card-deal inline-flex"><PlayingCard card={t.board[i]} size="sm" highlight={winningCards.has(t.board[i])} /></span>
                ) : (
                  <div key={i} className="h-12 w-[34px] rounded-[5px] border border-dashed border-[hsl(0_0%_80%/0.18)]" />
                )
              )}
            </div>
            <p className="text-center text-xs text-[hsl(0_0%_88%/0.85)]" aria-live="polite">
              {winners.length
                ? winners.map((w) => `${t.seats[w.seat]?.name || "Someone"} wins ${w.amount.toLocaleString()}${w.hand ? ` · ${w.hand}` : ""}`).join(" · ")
                : dealing && result ? "All in. Dealing the board." : PHASE_LABEL[t.phase]}
            </p>
          </div>

          {/* seats */}
          {t.seats.map((s, i) => {
            const d = (i - anchor + t.seats.length) % t.seats.length;
            const [x, y] = SPOTS[d] || SPOTS[0];
            const bx = x + (50 - x) * 0.42;
            const by = y + (50 - y) * 0.42;
            if (seatEmpty(s)) {
              return (
                <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                  {!seated ? (
                    <button
                      onClick={() => setSitAt(i)}
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed text-xs font-bold transition-colors",
                        sitAt === i ? "border-gold bg-gold/15 text-gold" : "border-bronze/60 bg-black/40 text-mist hover:text-gold"
                      )}
                    >
                      Sit
                    </button>
                  ) : (
                    <div className="h-12 w-12 rounded-full border border-dashed border-bronze/30" />
                  )}
                </div>
              );
            }
            const isTurn = BETTING.includes(t.phase) && t.turn === i;
            const show = revealed[i] && revealed[i].cards;
            const winner = winnerSeats.has(i);
            return (
              <React.Fragment key={i}>
                <Seat
                  s={notYetPaid[i] ? { ...s, stack: s.stack - notYetPaid[i] } : s}
                  handNo={t.hand_no}
                  x={x}
                  y={y}
                  isTurn={isTurn}
                  left={left}
                  dealer={t.dealer === i && t.phase !== "waiting"}
                  mine={i === mySeat}
                  winner={winner}
                  cards={show ? revealed[i].cards : null}
                  hidden={s.in_hand && !s.folded && !show && i !== mySeat && t.phase !== "waiting"}
                  best={winningCards}
                />
                {s.bet > 0 && (
                  <div
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-gold"
                    style={{ left: `${bx}%`, top: `${by}%` }}
                  >
                    <Ingot size={11} /> {s.bet.toLocaleString()}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {error && <p role="alert" className="text-center text-sm text-ember">{error}</p>}

        {!seated && sitAt !== null && (
          <BuyIn
            table={t}
            balance={account.member.points}
            onCancel={() => setSitAt(null)}
            onConfirm={async (amount) => {
              await send("join", { seat: sitAt, buyin: amount });
              setSitAt(null);
              reload();
            }}
          />
        )}
        {!seated && sitAt === null && (
          <p className="text-center text-sm text-mist">You're watching. Tap an empty seat to sit down.</p>
        )}

        {seated && <MyControls t={t} me={notYetPaid[mySeat] ? { ...me, stack: me.stack - notYetPaid[mySeat] } : me} mySeat={mySeat} cards={state.my_cards} send={send} reload={reload} best={winningCards} />}

        {t.log && t.log.length > 0 && (
          <details className="rounded-md border border-bronze/40 bg-black/20 px-3 py-2">
            <summary className="cursor-pointer text-sm text-mist">Table log</summary>
            <ul className="mt-2 space-y-1 text-xs text-mist">
              {[...t.log].reverse().map((l, k) => (
                <li key={k}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="lg:sticky lg:top-24">
        <ChatBox channels={channels} height="h-80 lg:h-[26rem]" />
      </div>
    </div>
  );
}

function Seat({ s, x, y, isTurn, left, dealer, mine, winner, cards, hidden, best, handNo }) {
  const pct = Math.max(0, Math.min(1, left / ACTION_SECONDS));
  return (
    <div
      className={cn("absolute flex w-[80px] -translate-x-1/2 -translate-y-1/2 flex-col items-center", (s.folded || s.sitting_out) && "opacity-50")}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {(cards || hidden) && (
        <div className="mb-[-10px] flex gap-0.5">
          {cards
            ? cards.map((c) => <PlayingCard key={c} card={c} size="xs" highlight={best.has(c)} />)
            : [0, 1].map((k) => <Dealt key={`${handNo}-${k}`} delay={k * 350}><PlayingCard back size="xs" /></Dealt>)}
        </div>
      )}
      <div className="relative">
        <div
          className={cn("rounded-full p-[3px]", winner && "win-glow")}
          style={{
            background: isTurn
              ? `conic-gradient(hsl(var(--gold)) ${pct * 360}deg, hsl(0 0% 100% / 0.12) 0deg)`
              : mine
                ? "hsl(var(--jade))"
                : "hsl(0 0% 32%)"
          }}
        >
          <Avatar url={s.avatar} name={s.name} size={42} className="border-2 border-[hsl(0_0%_7%)]" />
        </div>
        {dealer && (
          <span className="absolute -right-2 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-bronze bg-[hsl(0_0%_90%)] text-[10px] font-extrabold text-[hsl(0_0%_7%)]" title="Dealer">
            D
          </span>
        )}
      </div>
      <div className={cn("mt-1 w-full rounded border bg-black/70 px-1 py-0.5 text-center", isTurn ? "border-gold" : "border-bronze/50")}>
        <p className="truncate text-[11px] font-bold leading-tight">{mine ? "You" : s.name}</p>
        <p className="flex items-center justify-center gap-0.5 text-[11px] leading-tight text-gold tabular-nums">
          <Ingot size={10} /> {s.stack.toLocaleString()}
        </p>
      </div>
      {(s.last_action || s.sitting_out) && (
        <p className="mt-0.5 max-w-full truncate rounded-sm bg-black/50 px-1 text-[10px] text-mist">
          {s.sitting_out ? "Away" : s.last_action}
        </p>
      )}
    </div>
  );
}

function MyControls({ t, me, mySeat, cards, send, reload, best }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [topup, setTopup] = useState(false);
  const myTurn = BETTING.includes(t.phase) && t.turn === mySeat;
  const toCall = Math.max(0, t.current_bet - me.bet);
  const maxTo = me.bet + me.stack;
  const pot = t.seats.reduce((a, s) => a + (s && s.in_hand ? s.committed || 0 : 0), 0);
  const minTo = Math.min(maxTo, t.current_bet === 0 ? t.big_blind : t.current_bet + (t.min_raise || t.big_blind));
  const [raiseTo, setRaiseTo] = useState(minTo);
  // New street or a new bet: start the slider from the smallest legal raise again.
  useEffect(() => setRaiseTo(minTo), [minTo, t.phase, t.hand_no]);
  const target = Math.min(maxTo, Math.max(minTo, raiseTo));
  const canRaise = maxTo > t.current_bet;
  const inHand = me.in_hand && !me.folded && BETTING.includes(t.phase);

  const presets = useMemo(() => {
    const potAfterCall = pot + toCall;
    return [
      { label: "Min", to: minTo },
      { label: "½ pot", to: t.current_bet + Math.round(potAfterCall / 2) },
      { label: "Pot", to: t.current_bet + potAfterCall },
      { label: "All in", to: maxTo }
    ].map((p) => ({ ...p, to: Math.min(maxTo, Math.max(minTo, p.to)) }));
  }, [pot, toCall, minTo, maxTo, t.current_bet]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, "That didn't go through."));
    } finally {
      setBusy(false);
    }
  };
  const move = (m, amount) => run(() => send("act", { move: m, amount }));

  return (
    <Panel title={myTurn ? "Your move" : "Your seat"} className={cn(myTurn && "shadow-[0_0_0_1px_hsl(var(--gold)),0_0_30px_-6px_hsl(var(--gold)/0.6)]")}>
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          {cards && cards.length ? (
            <DealtCards key={t.hand_no} cards={cards} size="lg" step={400} cardProps={(c) => ({ dim: me.folded, highlight: best.has(c) })} />
          ) : (
            <>
              <PlayingCard back size="lg" className="opacity-40" />
              <PlayingCard back size="lg" className="opacity-40" />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex items-center gap-1.5">
            <span className="text-mist">In front of you</span>
            <Ingot size={14} />
            <span className="font-heading text-lg font-bold text-gold tabular-nums">{me.stack.toLocaleString()}</span>
          </p>
          <p className="mt-1 text-mist">
            {me.folded && BETTING.includes(t.phase)
              ? "You folded. Next hand soon."
              : myTurn
                ? toCall > 0
                  ? `${toCall.toLocaleString()} to call.`
                  : "Check or bet."
                : BETTING.includes(t.phase)
                  ? `Waiting for ${t.seats[t.turn]?.name || "the next player"}.`
                  : me.sitting_out
                    ? "You're sitting out."
                    : t.phase === "waiting"
                      ? "Waiting for another player to sit down."
                      : "Next hand is about to start."}
          </p>
        </div>
      </div>

      {myTurn && (
        <div className="mt-4 space-y-3">
          {canRaise && (
            <div>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {presets.map((p) => (
                  <button key={p.label} type="button" onClick={() => setRaiseTo(p.to)} className="btn-bronze h-8 text-xs" data-on={target === p.to}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={minTo}
                  max={maxTo}
                  step={1}
                  value={target}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                  className="flex-1 accent-[hsl(var(--gold))]"
                  aria-label="Raise amount"
                />
                <input
                  type="number"
                  value={target}
                  min={minTo}
                  max={maxTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value) || minTo)}
                  className="field h-9 w-24 text-sm"
                  aria-label="Raise to"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => move("fold")} disabled={busy} className="btn-bronze h-12 text-sm">Fold</button>
            <button onClick={() => move(toCall ? "call" : "check")} disabled={busy} className="btn-bronze h-12 text-sm" data-on="true">
              {toCall ? (toCall >= me.stack ? `All in ${me.stack.toLocaleString()}` : `Call ${toCall.toLocaleString()}`) : "Check"}
            </button>
            {canRaise ? (
              <button onClick={() => move(target >= maxTo ? "allin" : "raise", target)} disabled={busy} className="btn-seal h-12 text-sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : target >= maxTo ? "All in" : `${t.current_bet ? "Raise to" : "Bet"} ${target.toLocaleString()}`}
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}

      {!myTurn && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!inHand && (me.stack < t.max_buyin) && (
            <button onClick={() => setTopup((v) => !v)} className="btn-bronze h-9 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add chips
            </button>
          )}
          <button
            onClick={() => run(() => send(me.sitting_out ? "sitin" : "sitout"))}
            disabled={busy}
            className="btn-bronze h-9 px-3 text-xs"
          >
            <Coffee className="h-3.5 w-3.5" /> {me.sitting_out ? "I'm back" : "Sit out next hands"}
          </button>
          {confirmLeave ? (
            <button
              onClick={() => run(async () => { await send("leave"); reload(); })}
              disabled={busy}
              className="btn-seal h-9 px-3 text-xs"
            >
              {inHand ? "Fold and cash out" : `Cash out ${me.stack.toLocaleString()}`}
            </button>
          ) : (
            <button onClick={() => setConfirmLeave(true)} className="btn-bronze h-9 px-3 text-xs">
              <LogOut className="h-3.5 w-3.5" /> Leave table
            </button>
          )}
        </div>
      )}
      {topup && !myTurn && (
        <TopUp
          t={t}
          me={me}
          onDone={() => setTopup(false)}
          send={send}
          reload={reload}
        />
      )}
    </Panel>
  );
}

function TopUp({ t, me, send, reload, onDone }) {
  const { account } = useGuild();
  const room = t.max_buyin - me.stack;
  const max = Math.min(room, account.member.points);
  const [amount, setAmount] = useState(Math.min(max, t.big_blind * 50));
  const [error, setError] = useState("");
  if (max <= 0) return <p className="mt-3 text-xs text-mist">You can't add more chips here right now.</p>;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input type="number" className="field h-9 w-28 text-sm" value={amount} min={1} max={max} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Chips to add" />
      <button
        className="btn-seal h-9 px-4 text-xs"
        onClick={async () => {
          try {
            await send("topup", { amount });
            reload();
            onDone();
          } catch (e) {
            setError(errorText(e, "Couldn't add chips."));
          }
        }}
      >
        Add {Number(amount || 0).toLocaleString()}
      </button>
      <span className="text-xs text-mist">Up to {max.toLocaleString()}</span>
      {error && <p role="alert" className="w-full text-xs text-ember">{error}</p>}
    </div>
  );
}