import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Minus, Plus, Ticket } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import Avatar from "@/components/Avatar";
import LanternSpinner from "@/components/LanternSpinner";
import RaffleWheel, { landOnMember } from "@/components/raffle/RaffleWheel";
import RaffleAdmin from "@/components/raffle/RaffleAdmin";
import { Ingot, Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

const POLL_MS = 6000;
const SPIN_MS = 6500;
const PLACE = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

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
            <RaffleCard key={r.id} raffle={r} member={member} leader={leader} serverNow={now + offset} onChange={load} />
          ))}
          {open.length === 0 && (
            <Panel title="No raffle running">
              <p className="py-2 text-center text-sm text-mist">
                {leader ? "Start one below. It will be announced in guild chat." : "The Guild Leader hasn't opened a raffle yet. Check back soon."}
              </p>
            </Panel>
          )}
          {leader && <RaffleAdmin onCreated={load} />}
          {past.length > 1 && (
            <Panel title="Earlier raffles">
              <ul className="divide-y divide-bronze/25">
                {past.slice(1).map((r) => (
                  <li key={r.id} className="py-2.5 text-sm">
                    <p className="font-bold text-gold">{r.title}</p>
                    <p className="text-mist">
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

function RaffleCard({ raffle: r, member, leader, serverNow, onChange }) {
  const { setBalance, reload } = useGuild();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
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
  // Ask the server to draw as soon as the timer runs out.
  const asked = useRef(false);
  useEffect(() => {
    if (!drawn && left <= 0 && !asked.current) {
      asked.current = true;
      onChange();
    }
  }, [drawn, left, onChange]);

  const cap = r.max_tickets_per_member > 0 ? Math.max(0, r.max_tickets_per_member - r.my_tickets) : 1000;
  const afford = Math.floor(member.points / r.ticket_price);
  const most = Math.max(0, Math.min(cap, afford, 1000));
  const n = Math.min(Math.max(1, count), Math.max(1, most));
  const total = r.tickets_sold || 0;
  const myChance = total ? Math.round((r.my_tickets / total) * 1000) / 10 : 0;

  const act = async (key, payload, after) => {
    setBusy(key);
    setError("");
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

  return (
    <Panel title={r.title}>
      <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
        <div>
          <RaffleWheel entrants={r.entrants} rotation={rotation} spinMs={SPIN_MS} spinning={spinning} winnerId={revealed && first ? first.member_id : null} />
          <p className="mt-3 text-center text-sm text-mist" aria-live="polite">
            {spinning ? (
              "Drawing the winners"
            ) : drawn ? (
              first ? <>1st place: <b className="text-gold">{first.name}</b></> : "No tickets were sold."
            ) : (
              <>
                Draw in <span className="font-heading text-xl font-extrabold text-gold tabular-nums">{countdown(left)}</span>
              </>
            )}
          </p>
          {!drawn && <p className="text-center text-xs text-mist/80">{new Date(r.ends_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>}
        </div>

        <div className="min-w-0 space-y-5">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Fact label="Ticket price" value={<Points value={r.ticket_price} iconSize={14} />} />
            <Fact label="Tickets sold" value={total.toLocaleString()} />
            <Fact label={r.pot_to_first ? "Pot for 1st" : "Points spent"} value={<Points value={r.pot} iconSize={14} />} />
          </dl>

          <div>
            <p className="label">{drawn ? "Winners" : "Prizes"}</p>
            <ol className="space-y-1.5">
              {(r.prizes || []).map((p, i) => {
                const w = drawn && revealed ? (r.winners || []).find((x) => x.place === i + 1) : null;
                return (
                  <li key={i} className="flex items-center gap-3 rounded-md border border-bronze/40 bg-black/20 px-3 py-2 text-sm">
                    <span className={cn("w-8 shrink-0 font-heading font-extrabold", i === 0 ? "text-gold" : "text-mist")}>{PLACE[i]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">{p}</span>
                      {i === 0 && r.pot_to_first && (
                        <span className="flex items-center gap-1 text-xs text-mist">plus the ticket pot <Ingot size={12} /> {Number(w ? w.points : r.pot || 0).toLocaleString()}</span>
                      )}
                    </span>
                    {w && (
                      <span className="flex shrink-0 items-center gap-1.5 font-bold text-jade">
                        <Avatar url={w.avatar} name={w.name} size={22} /> {w.name}
                      </span>
                    )}
                    {drawn && revealed && !w && <span className="shrink-0 text-xs text-mist">Not drawn</span>}
                  </li>
                );
              })}
            </ol>
          </div>

          {!drawn && (
            <div className="rounded-md border border-bronze/40 bg-black/20 p-3">
              <p className="flex items-center gap-2 text-sm">
                <Ticket className="h-4 w-4 text-gold" aria-hidden="true" />
                {r.my_tickets > 0 ? (
                  <span>You hold <b className="text-gold">{r.my_tickets}</b> ticket{r.my_tickets > 1 ? "s" : ""} ({myChance}% of the wheel).</span>
                ) : (
                  <span>You have no tickets yet.</span>
                )}
              </p>
              {selling ? (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => setCount(Math.max(1, n - 1))} disabled={n <= 1} className="btn-bronze h-11 w-11 shrink-0" aria-label="One ticket fewer"><Minus className="h-4 w-4" /></button>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, most)}
                      value={n}
                      onChange={(e) => setCount(Math.floor(Number(e.target.value)) || 1)}
                      aria-label="Number of tickets"
                      className="field h-11 min-w-0 flex-1 text-center text-lg font-bold text-gold"
                    />
                    <button type="button" onClick={() => setCount(Math.min(most, n + 1))} disabled={n >= most} className="btn-bronze h-11 w-11 shrink-0" aria-label="One ticket more"><Plus className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setCount(most)} disabled={most <= 1} className="btn-bronze h-11 shrink-0 px-3 text-sm">Max</button>
                  </div>
                  <button onClick={buy} disabled={!!busy || most < 1 || member.banned} className="btn-seal mt-3 h-12 w-full text-base">
                    {busy === "buy" ? <><Loader2 className="h-4 w-4 animate-spin" /> Buying</> : `Buy ${n} ticket${n > 1 ? "s" : ""} for ${(n * r.ticket_price).toLocaleString()} points`}
                  </button>
                  <p className="mt-1.5 text-xs text-mist/80">
                    {member.banned
                      ? "You can't buy tickets while banned."
                      : cap === 0
                        ? `You hold the limit of ${r.max_tickets_per_member} tickets.`
                        : afford < 1
                          ? "You don't have enough points for a ticket."
                          : r.max_tickets_per_member > 0
                            ? `Limit ${r.max_tickets_per_member} tickets per member. Tickets can't be returned.`
                            : "Tickets can't be returned."}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-mist">Ticket sales have closed. The draw is about to run.</p>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-ember">{error}</p>}

          <div>
            <p className="label">On the wheel · {r.entrants.length} member{r.entrants.length === 1 ? "" : "s"}</p>
            {r.entrants.length === 0 ? (
              <p className="text-sm text-mist">Nobody yet. The first ticket owns the whole wheel.</p>
            ) : (
              <ul className="grid max-h-48 gap-x-4 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {r.entrants
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((e) => (
                    <li key={e.member_id} className="flex items-center gap-2 text-sm">
                      <Avatar url={e.avatar} name={e.name} size={22} />
                      <span className={cn("min-w-0 flex-1 truncate", e.member_id === member.id && "font-bold text-gold")}>{e.name}</span>
                      <span className="shrink-0 tabular-nums text-mist">{e.count} · {total ? Math.round((e.count / total) * 100) : 0}%</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {leader && !drawn && (
            <div className="border-t border-bronze/30 pt-4">
              <p className="label">Guild Leader</p>
              {confirm ? (
                <div className="rounded-md border border-gold/50 bg-gold/10 p-3 text-sm">
                  <p>{confirm === "drawNow" ? "Draw the winners right now? Ticket sales stop and this can't be undone." : "Cancel this raffle and refund every ticket?"}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => act(confirm, { action: confirm, raffleId: r.id })} disabled={!!busy} className="btn-seal h-10 px-4 text-sm">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === "drawNow" ? "Yes, draw now" : "Yes, cancel and refund"}
                    </button>
                    <button onClick={() => setConfirm("")} disabled={!!busy} className="btn-bronze h-10 px-4 text-sm">Keep it running</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setConfirm("drawNow")} className="btn-bronze h-10 px-4 text-sm">Draw now</button>
                  <button onClick={() => setConfirm("cancel")} className="btn-bronze h-10 px-4 text-sm !text-ember">Cancel and refund</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-md border border-bronze/40 bg-black/20 px-2 py-2">
      <dt className="text-xs text-mist">{label}</dt>
      <dd className="mt-0.5 flex justify-center font-heading text-base font-bold text-gold tabular-nums">{value}</dd>
    </div>
  );
}