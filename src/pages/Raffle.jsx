import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Loader2, Minus, Plus, Ticket, Send, Check, Lock, KeyRound, Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import LanternSpinner from "@/components/LanternSpinner";
import RaffleWheel, { landOnMember, sliceColors } from "@/components/raffle/RaffleWheel";
import RaffleAdmin from "@/components/raffle/RaffleAdmin";
import CodeSlots from "@/components/raffle/CodeSlots";
import RaffleEdit from "@/components/raffle/RaffleEdit";
import { useGuild, errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const POLL_MS = 10000;
const SPIN_MS = 6500;
const PLACE = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

// Days / hours / minutes boxes; under a day it shows hours / minutes / seconds.
function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return d > 0
    ? [[pad(d), d === 1 ? "day" : "days"], [pad(h), "hours"], [pad(m), "min"]]
    : [[pad(h), "hours"], [pad(m), "min"], [pad(sec), "sec"]];
}
const entries = (n) => `${Number(n).toLocaleString()} ${n === 1 ? "entry" : "entries"}`;
const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const MEDAL = [
  { ring: "bg-[#d4a72c] text-[#1a1205]", card: "border-[#6b5420] bg-[#1f1508]", label: "text-[#e8c15a]" },
  { ring: "bg-[#c9c9c9] text-[#111]", card: "border-[#333] bg-[#151515]", label: "text-[#d6d6d6]" },
  { ring: "bg-[#9b6b3f] text-white", card: "border-[#333] bg-[#151515]", label: "text-[#d39a68]" }
];
// The kind of prize `i`: what the Guild Leader chose, else "150 points" means points.
function kindOf(r, i) {
  const k = Array.isArray(r.prize_kinds) ? r.prize_kinds[i] : "";
  if (k === "item" || k === "points" || k === "code") return k;
  return prizePoints((r.prizes || [])[i]) > 0 ? "points" : "item";
}
// Same rule as the server: "150 points" / "1,500 pts" is paid automatically.
function prizePoints(label) {
  const m = String(label || "").match(/^\s*\+?\s*(\d[\d,]*)\s*(?:guild\s+)?(?:points?|pts?)\.?\s*$/i);
  return m ? Number(m[1].replace(/,/g, "")) || 0 : 0;
}

function countdown(ms) {
  if (ms <= 0) return "Drawing now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export default function Raffle() {
  const { account, loading } = useGuild();
  const [raffles, setRaffles] = useState(null);
  const [discordReady, setDiscordReady] = useState(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await base44.functions.invoke("raffleAction", { action: "list" });
      setRaffles(res.data.raffles || []);
      if (typeof res.data.discord_announce === "boolean") setDiscordReady(res.data.discord_announce);
      if (res.data.server_now) setOffset(Date.parse(res.data.server_now) - Date.now());
      setError("");
    } catch (e) {
      setRaffles((r) => r || []);
      setError(errorText(e, "Couldn't load the raffles."));
    } finally {
      inFlight.current = false;
    }
  }, []);

  const linked = !!account && account.linked;
  useEffect(() => {
    if (!linked) return;
    load();
    const subs = [];
    try {
      subs.push(base44.entities.Raffle.subscribe(() => load()));
      subs.push(base44.entities.RaffleTicket.subscribe(() => load()));
    } catch {
      /* polling covers it */
    }
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      subs.forEach((u) => u && u());
    };
  }, [linked, load]);

  if (loading) return <LanternSpinner label="Fetching the tickets" className="py-24" />;
  if (!linked) return <Navigate to="/link-discord" replace />;

  const member = account.member;
  const leader = member.role === "leader";
  const open = (raffles || []).filter((r) => r.status === "open");
  const past = (raffles || []).filter((r) => r.status === "drawn");
  const latest = past[0];

  return (
    <div className="mx-auto max-w-[64rem] space-y-5">
      <header className="text-center">
        <h1 className="font-heading text-3xl font-extrabold gilt-text">Guild raffle</h1>
        <p className="mt-1 text-sm text-mist">Buy tickets with points. Every ticket puts your name on the wheel one more time.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}

      {raffles === null ? (
        <LanternSpinner label="Loading raffles" className="py-12" />
      ) : (
        <>
          {[...open, ...(latest ? [latest] : [])].map((r) => (
            <RaffleCard key={r.id} raffle={r} member={member} leader={leader} discordReady={discordReady} serverNow={now + offset} onChange={load} />
          ))}
          {open.length === 0 && (
            <Panel title="No raffle running">
              <p className="py-2 text-center text-sm text-mist">
                {leader ? "Start one below. It will be announced in guild chat." : "The Guild Leader hasn't opened a raffle yet. Check back soon."}
              </p>
            </Panel>
          )}
          {leader && <RaffleAdmin onCreated={load} discordReady={discordReady} />}
          {past.length > 1 && (
            <Panel title="Earlier raffles">
              <ul className="divide-y divide-bronze/25">
                {past.slice(1).map((r) => (
                  <li key={r.id} className="py-2.5 text-sm">
                    <p className="font-heading text-base font-semibold text-white">{r.title}</p>
                    <p className="text-[15px] text-[#c4c4c4]">
                      {(r.winners || []).length ? r.winners.map((w) => `${PLACE[w.place - 1]}: ${w.name} (${w.prize})`).join(" · ") : "No tickets were sold."}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function RaffleCard({ raffle: r, member, leader, discordReady, serverNow, onChange }) {
  const { setBalance, reload } = useGuild();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [ping, setPing] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(r.status === "drawn");
  const wasOpen = useRef(r.status === "open");

  const drawn = r.status === "drawn";
  const first = drawn && r.winners && r.winners[0];

  // The draw happened while this page was open: spin to the 1st place winner.
  useEffect(() => {
    if (!drawn) return;
    if (!wasOpen.current || !first) {
      if (first) setRotation(landOnMember(0, r.entrants, first.member_id, 0));
      setRevealed(true);
      return;
    }
    wasOpen.current = false;
    setRevealed(false);
    setSpinning(true);
    setRotation((cur) => landOnMember(cur, r.entrants, first.member_id));
    const t = setTimeout(() => {
      setSpinning(false);
      setRevealed(true);
      reload();
    }, SPIN_MS + 100);
    return () => clearTimeout(t);
  }, [drawn]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = Date.parse(r.ends_at) - serverNow;
  const selling = !drawn && left > 0;
  // Ask the server to draw as soon as the timer runs out, then keep checking until it has.
  const asked = useRef(0);
  useEffect(() => {
    if (drawn || left > 0) return;
    if (Date.now() - asked.current > 4000) {
      asked.current = Date.now();
      onChange();
    }
  }, [drawn, left, onChange]);

  const cap = r.max_tickets_per_member > 0 ? Math.max(0, r.max_tickets_per_member - r.my_tickets) : 1000;
  const afford = Math.floor(member.points / r.ticket_price);
  const most = Math.max(0, Math.min(cap, afford, 1000));
  const n = Math.min(Math.max(1, count), Math.max(1, most));
  const total = r.tickets_sold || 0;
  const colors = sliceColors(r.entrants);
  const ranked = r.entrants.slice().sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));

  const act = async (key, payload, after) => {
    setBusy(key);
    setError("");
    setNote("");
    try {
      const res = await base44.functions.invoke("raffleAction", payload);
      after && after(res.data);
      setConfirm("");
      await onChange();
    } catch (e) {
      setError(errorText(e, "That didn't work. Try again."));
    } finally {
      setBusy("");
    }
  };
  const buy = () => act("buy", { action: "buy", raffleId: r.id, count: n }, (d) => setBalance(d.balance));
  const post = () => act("announce", { action: "announce", raffleId: r.id, ping }, () => setNote(ping ? "Posted to Discord with @everyone." : "Posted to Discord."));

  return (
    <section aria-label={r.title} className="rounded-xl border border-bronze/60 border-t-[3px] border-t-crimson bg-[#111111] p-4 sm:p-6 md:p-7">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5">
            <span className={cn("rounded px-2.5 py-0.5 font-heading text-[13px] font-semibold tracking-[0.14em] text-white", drawn ? "bg-[#2e7f5e]" : "bg-crimson")}>{drawn ? "DRAWN" : "LIVE"}</span>
            <span className="text-[15px] text-[#c4c4c4]">Guild raffle</span>
          </p>
          <h2 className="mt-2.5 break-words font-heading text-[30px] font-bold leading-[1.08] tracking-[0.01em] text-white md:text-[40px]">{r.title}</h2>
        </div>
        {!drawn ? (
          <div className="shrink-0 md:text-right">
            <p className="text-sm text-[#c4c4c4]">{left > 0 ? "Draw in" : "Drawing the winners"}</p>
            {left > 0 && (
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 md:flex" aria-live="off" aria-label={`Draw in ${countdown(left)}`}>
                {countdownParts(left).map(([v, unit]) => (
                  <div key={unit} className="rounded-lg bg-[#1c1c1c] px-2 py-2 text-center md:w-16">
                    <div className="font-heading text-[28px] font-semibold leading-none tabular-nums text-white">{v}</div>
                    <div className="mt-1 text-xs text-[#c4c4c4]">{unit}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[13px] text-[#c4c4c4]">{new Date(r.ends_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} your time</p>
          </div>
        ) : (
          <p className="shrink-0 text-[15px] text-[#c4c4c4]">Drawn {new Date(r.drawn_at || r.ends_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        )}
      </header>

      <div className="mt-6 grid gap-7 md:grid-cols-[300px_minmax(0,1fr)] md:items-start">
        <div className="min-w-0">
          <RaffleWheel entrants={r.entrants} rotation={rotation} spinMs={SPIN_MS} spinning={spinning} winnerId={revealed && first ? first.member_id : null} centerLabel={total} />
          <p className="mt-3 min-h-[1.75rem] text-center text-[15px] text-[#c4c4c4]" aria-live="polite">
            {spinning ? "Drawing the winners…" : drawn ? (first ? <>1st place: <b className="font-heading text-lg text-white">{first.name}</b></> : "No tickets were sold.") : null}
          </p>
          <p className="mb-2 mt-3 font-heading text-[15px] tracking-[0.12em] text-[#c4c4c4]">ON THE WHEEL · {r.entrants.length} {r.entrants.length === 1 ? "MEMBER" : "MEMBERS"}</p>
          {r.entrants.length === 0 ? (
            <p className="text-[15px] text-[#c4c4c4]">Nobody yet. The first ticket owns the whole wheel.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {ranked.map((e) => (
                <li key={e.member_id} className="flex items-center gap-2.5 text-base">
                  <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: colors[e.member_id] }} aria-hidden="true" />
                  <Avatar url={e.avatar} name={e.name} size={22} />
                  <span className={cn("min-w-0 flex-1 truncate font-medium", e.member_id === member.id ? "text-[#e8c15a]" : "text-white")}>{e.name}{e.member_id === member.id ? " (you)" : ""}</span>
                  <span className="shrink-0 font-heading tabular-nums text-[#c4c4c4]">{entries(e.count)} · {pct(e.count, total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            <Fact label="Ticket price" value={r.ticket_price} unit="pts" />
            <Fact label="Tickets sold" value={total} />
            <Fact label={r.pot_to_first ? "Pot for 1st" : "Points spent"} value={r.pot || 0} unit="pts" />
          </dl>

          <div>
            <p className="mb-2.5 font-heading text-[15px] tracking-[0.12em] text-[#c4c4c4]">{drawn ? "WINNERS" : "PRIZES"}</p>
            <ol className="grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
              {(r.prizes || []).map((p, i) => {
                const w = drawn && revealed ? (r.winners || []).find((x) => x.place === i + 1) : null;
                const m = MEDAL[Math.min(i, 2)];
                const kind = kindOf(r, i);
                const pot = i === 0 && r.pot_to_first;
                const mineWin = w && w.member_id === member.id;
                return (
                  <li key={i} className={cn("flex flex-col gap-1.5 rounded-xl border p-4", i < 3 ? m.card : "border-[#333] bg-[#151515]")}>
                    <span className="flex items-center gap-2.5">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-[15px] font-bold", m.ring)}>{PLACE[i]}</span>
                      <span className={cn("font-heading text-sm tracking-[0.12em]", m.label)}>{PLACE[i].toUpperCase()} PRIZE</span>
                    </span>
                    <span className="break-words text-xl font-bold leading-snug text-white">{p}</span>
                    {pot && <span className="text-sm text-[#e8c15a]">+ the ticket pot ({Number(w ? w.pot_points ?? w.points : r.pot || 0).toLocaleString()} pts)</span>}
                    {!w && (
                      <span className={cn("flex items-center gap-1.5 text-sm", kind === "points" ? "text-[#6fd3a2]" : kind === "code" ? "text-[#e8c15a]" : "text-[#c4c4c4]")}>
                        {kind === "code" && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        {kind === "points" ? "Paid to the winner automatically" : kind === "code" ? "Code sent privately to the winner" : "Handed out in game by the Guild Leader"}
                      </span>
                    )}
                    {w && (
                      <span className="mt-1 flex items-center gap-2 border-t border-white/10 pt-2">
                        <Avatar url={w.avatar} name={w.name} size={24} />
                        <span className="min-w-0 flex-1 truncate font-heading text-base font-semibold text-[#6fd3a2]">{w.name}</span>
                        {w.points > 0 && <span className="shrink-0 text-xs text-[#c4c4c4]">+{w.points.toLocaleString()} pts</span>}
                      </span>
                    )}
                    {w && kind === "code" && (mineWin ? (
                      <Link to="/profile#prizes" className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#d4a72c] px-3 font-heading text-[15px] font-semibold tracking-[0.04em] text-[#1a1205] hover:bg-[#e8c15a]">
                        <KeyRound className="h-4 w-4" aria-hidden="true" /> {w.code_status === "delivered" ? "OPEN YOUR CODE" : "YOUR CODE IS ON THE WAY"}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-[#c4c4c4]"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> {w.code_status === "delivered" ? "Code sent privately to the winner" : "Code on its way to the winner"}</span>
                    ))}
                    {drawn && revealed && !w && <span className="text-sm text-[#c4c4c4]">Not drawn (not enough members)</span>}
                  </li>
                );
              })}
            </ol>
          </div>

          {!drawn && (
            <div className="rounded-xl border border-bronze/50 bg-[#161616] p-4">
              <p className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-[#e8c15a]" aria-hidden="true" />
                  {r.my_tickets > 0 ? <span>You hold <b>{r.my_tickets.toLocaleString()} {r.my_tickets === 1 ? "ticket" : "tickets"}</b> ({pct(r.my_tickets, total)} of the wheel)</span> : <span>You have no tickets yet</span>}
                </span>
                <span className="text-[15px] text-[#c4c4c4]">Balance {Number(member.points || 0).toLocaleString()} pts</span>
              </p>
              {selling ? (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => setCount(Math.max(1, n - 1))} disabled={n <= 1} className="btn-bronze h-12 w-12 shrink-0" aria-label="One ticket fewer"><Minus className="h-4 w-4" /></button>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, most)}
                      value={n}
                      onChange={(e) => setCount(Math.floor(Number(e.target.value)) || 1)}
                      aria-label="Number of tickets"
                      className="field h-12 min-w-0 flex-1 text-center font-heading text-[22px] font-semibold text-white"
                    />
                    <button type="button" onClick={() => setCount(Math.min(most, n + 1))} disabled={n >= most} className="btn-bronze h-12 w-12 shrink-0" aria-label="One ticket more"><Plus className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {[1, 5, 10].map((q) => (
                      <button key={q} type="button" onClick={() => setCount(q)} disabled={most < q} data-on={n === q} className="btn-bronze h-10 font-heading text-base">{q}</button>
                    ))}
                    <button type="button" onClick={() => setCount(most)} disabled={most <= 1} data-on={most > 1 && n === most} className="btn-bronze h-10 font-heading text-base">MAX</button>
                  </div>
                  <button onClick={buy} disabled={!!busy || most < 1 || member.banned} className="btn-seal mt-3 h-[52px] w-full font-heading text-lg tracking-[0.06em]">
                    {busy === "buy" ? <><Loader2 className="h-4 w-4 animate-spin" /> Buying</> : `BUY ${n.toLocaleString()} ${n === 1 ? "TICKET" : "TICKETS"} · ${(n * r.ticket_price).toLocaleString()} PTS`}
                  </button>
                  <p className="mt-2 text-sm text-[#c4c4c4]">
                    {member.banned
                      ? "You can't buy tickets while banned."
                      : cap === 0
                        ? `You hold the limit of ${r.max_tickets_per_member} tickets.`
                        : afford < 1
                          ? "You don't have enough points for a ticket."
                          : r.max_tickets_per_member > 0
                            ? `Limit ${r.max_tickets_per_member} tickets per member. Tickets can't be returned.`
                            : "Each ticket is one more slice of the wheel. Tickets can't be returned."}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[15px] text-[#c4c4c4]">Ticket sales have closed. The winners are being drawn.</p>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-[15px] text-ember">{error}</p>}
          {note && <p role="status" className="text-[15px] text-jade">{note}</p>}

          {leader && editing && selling && (
            <RaffleEdit raffle={r} onClose={() => setEditing(false)} onSaved={async (msg) => { setEditing(false); setError(""); setNote(msg); await onChange(); }} />
          )}

          {leader && !editing && Array.isArray(r.code_slots) && r.code_slots.some(Boolean) && (
            <CodeSlots raffle={r} drawn={drawn} onChange={onChange} />
          )}

          {leader && !drawn && !editing && (
            <div className="rounded-xl border border-bronze/50 bg-[#161616] p-4">
              <p className="font-heading text-[15px] tracking-[0.12em] text-[#c4c4c4]">GUILD LEADER</p>
              {confirm ? (
                <div className="mt-3 rounded-md border border-gold/50 bg-gold/10 p-3 text-[15px]">
                  <p>{confirm === "drawNow" ? "Draw the winners right now? Ticket sales stop and this can't be undone." : "Cancel this raffle and refund every ticket?"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => act(confirm, { action: confirm, raffleId: r.id })} disabled={!!busy} className="btn-seal h-11 px-4 text-sm">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === "drawNow" ? "Yes, draw now" : "Yes, cancel and refund"}
                    </button>
                    <button onClick={() => setConfirm("")} disabled={!!busy} className="btn-bronze h-11 px-4 text-sm">Keep it running</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button onClick={post} disabled={!!busy || discordReady === false} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#5865f2] px-4 font-heading text-[15px] tracking-[0.04em] text-white hover:bg-[#4752c4] disabled:opacity-50">
                      {busy === "announce" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />} POST TO DISCORD
                    </button>
                    {selling && (
                      <button onClick={() => { setConfirm(""); setNote(""); setEditing(true); }} className="btn-bronze h-11 px-4 text-sm"><Pencil className="h-4 w-4" aria-hidden="true" /> Edit raffle</button>
                    )}
                    <button onClick={() => setConfirm("drawNow")} className="btn-bronze h-11 px-4 text-sm">Draw now</button>
                    <button onClick={() => setConfirm("cancel")} className="btn-bronze h-11 px-4 text-sm !text-ember">Cancel and refund</button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-[15px]">
                    <input type="checkbox" checked={ping} onChange={(e) => setPing(e.target.checked)} className="h-4 w-4 accent-[#5865f2]" />
                    Ping @everyone
                  </label>
                  <p className="mt-1.5 text-sm text-[#c4c4c4]">
                    {discordReady === false
                      ? "Discord announcements aren't connected yet. Add the DISCORD_ANNOUNCE_WEBHOOK_URL secret (a webhook for your announcements channel)."
                      : r.announced_at
                        ? <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-jade" aria-hidden="true" /> Posted to Discord {ago(r.announced_at)}. Winners are posted there too when the draw runs.</span>
                        : "Posts this raffle to your announcements channel. Winners are posted there too when the draw runs."}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value, unit }) {
  return (
    <div className="rounded-lg bg-[#1a1a1a] px-3 py-3">
      <dt className="text-sm text-[#c4c4c4]">{label}</dt>
      <dd className="mt-1 font-heading text-[22px] font-semibold leading-none tabular-nums text-white sm:text-[28px]">
        {Number(value || 0).toLocaleString()}{unit && <span className="ml-1 text-sm text-[#d4a72c] sm:text-base">{unit}</span>}
      </dd>
    </div>
  );
}