import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { Points } from "@/components/SealLogo";
import { useGuild, errorText } from "@/lib/GuildContext";
import SuitOrder from "./SuitOrder";

const STATUS = { waiting: "Waiting for players", playing: "Game in progress", finished: "Between games" };

export default function PusoyLobby() {
  const { account } = useGuild();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [stake, setStake] = useState("");
  const [busy, setBusy] = useState("");
  const balance = account.member.points;

  const load = async () => {
    try {
      const res = await base44.functions.invoke("pusoyAction", { action: "list" });
      setData(res.data);
      setStake((s) => (s === "" ? String(res.data.limits.min) : s));
    } catch (e) {
      setError(errorText(e, "Couldn't open the Pusoy Dos tables."));
      setData((d) => d || { tables: [], limits: { min: 1, max: 1 } });
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const run = async (key, body, go) => {
    setBusy(key);
    setError("");
    try {
      const res = await base44.functions.invoke("pusoyAction", body);
      navigate(`/pusoy/${go || res.data.id}`);
    } catch (e) {
      setError(errorText(e, "That didn't go through. Try again."));
      setBusy("");
    }
  };

  if (!data) return <LanternSpinner label="Shuffling the deck" className="py-24" />;
  const { tables, limits } = data;
  const n = Math.floor(Number(stake));
  const stakeOk = Number.isInteger(n) && n >= limits.min && n <= limits.max;
  const mine = tables.find((t) => t.seated_here);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-extrabold gilt-text">Pusoy Dos</h1>
        <p className="mt-1 text-sm text-mist">
          Play other members live, 2 to 4 at a table. First to empty their hand wins, and everyone else pays the table stake for each card they still hold.
        </p>
      </header>

      <SuitOrder />
      {error && <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}

      {tables.length === 0 && (
        <Panel title="No tables open">
          <p className="text-center text-sm text-mist">Open one below and others can join you.</p>
        </Panel>
      )}

      {tables.map((t) => {
        const need = t.stake * 13;
        return (
          <Panel key={t.id} title={t.name}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-mist">Per card</dt>
                  <dd><Points value={t.stake} className="font-heading font-bold text-gold" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Players</dt>
                  <dd className="flex items-center gap-1 tabular-nums"><Users className="h-3.5 w-3.5 text-mist" /> {t.players}/{t.max_seats}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Status</dt>
                  <dd>{STATUS[t.status]}</dd>
                </div>
              </dl>
              {t.seated_here ? (
                <Link to={`/pusoy/${t.id}`} className="btn-seal h-10 px-5 text-sm">Back to your seat</Link>
              ) : (
                <div className="flex gap-2">
                  <Link to={`/pusoy/${t.id}`} className="btn-bronze h-10 px-4 text-sm">Watch</Link>
                  <button
                    onClick={() => run("sit" + t.id, { action: "sit", tableId: t.id }, t.id)}
                    disabled={!!busy || !!mine || t.players >= t.max_seats || balance < need}
                    className="btn-seal h-10 px-5 text-sm"
                  >
                    {busy === "sit" + t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t.players >= t.max_seats ? "Table full" : "Take a seat"}
                  </button>
                </div>
              )}
            </div>
            {!t.seated_here && balance < need && <p className="mt-2 text-xs text-mist">You need {need.toLocaleString()} points to sit here (13 cards × {t.stake}).</p>}
          </Panel>
        );
      })}

      {!mine && (
        <Panel title="Open a table">
          <form onSubmit={(e) => { e.preventDefault(); if (stakeOk) run("create", { action: "create", stake: n }); }} className="space-y-3">
            <div>
              <label className="label" htmlFor="pd-stake">Points per card left in hand</label>
              <input id="pd-stake" type="number" inputMode="numeric" min={limits.min} max={limits.max} className="field" value={stake} onChange={(e) => setStake(e.target.value)} required />
              <p className="mt-1 text-xs text-mist">
                Between {limits.min.toLocaleString()} and {limits.max.toLocaleString()}.
                {stakeOk && <> The most anyone can lose in one game is {(n * 13).toLocaleString()}, and you need that much to sit down.</>}
              </p>
            </div>
            <button type="submit" disabled={!!busy || !stakeOk || balance < n * 13 || data.open === false} className="btn-seal h-11 w-full text-sm">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : balance < n * 13 ? "Not enough points for that stake" : "Open table and sit down"}
            </button>
          </form>
        </Panel>
      )}

      <Panel title="How to play">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-mist">
          <li>Everyone is dealt 13 cards. Whoever holds the lowest card dealt goes first and must play it.</li>
          <li>Play a single card, a pair, three of a kind, or a five-card hand. The next player must beat it with the same number of cards, or pass.</li>
          <li>Five-card hands, low to high: straight, flush, full house, four of a kind (plus any card), straight flush. Straights run from 3 up to Ace; a 2 can't be in a straight.</li>
          <li>Ties on rank are settled by suit: Spade beats Heart beats Club beats Diamond.</li>
          <li>When everyone else passes, the last player to play leads anything they like.</li>
          <li>You have 20 seconds a turn. Run out and your turn is skipped. Three times in a row, or leaving mid-game, forfeits: you're out of the game and pay for every card you hold.</li>
          <li>The first player out wins. Everyone else pays the stake for each card left, and 2% of the winnings is removed from circulation.</li>
        </ul>
      </Panel>
    </div>
  );
}