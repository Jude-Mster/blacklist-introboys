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
  const [pot, setPot] = useState("");
  const [perCard, setPerCard] = useState(false);
  const [stake, setStake] = useState("");
  const [busy, setBusy] = useState("");
  const balance = account.member.points;

  const load = async () => {
    try {
      const res = await base44.functions.invoke("pusoyAction", { action: "list" });
      setData(res.data);
      setPot((s) => (s === "" ? String(res.data.limits.pot_min) : s));
      setStake((s) => (s === "" ? "1" : s));
    } catch (e) {
      // A missed background refresh isn't worth an error: keep showing the last list.
      setData((d) => { if (!d) setError(errorText(e, "Couldn't open the Pusoy Dos tables.")); return d || { tables: [], limits: { pot_min: 1, pot_max: 1, card_max: 1 } }; });
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
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
  const a = Math.floor(Number(pot));
  const potOk = Number.isInteger(a) && a >= limits.pot_min && a <= limits.pot_max;
  const n = perCard ? Math.floor(Number(stake)) : 0;
  const stakeOk = !perCard || (Number.isInteger(n) && n >= 1 && n <= limits.card_max);
  const formOk = potOk && stakeOk;
  const needNew = a + n * 13;
  const mine = tables.find((t) => t.seated_here);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-extrabold gilt-text">Pusoy Dos</h1>
        <p className="mt-1 text-sm text-mist">
          Play other members live, 2 to 4 at a table. Everyone puts in the pot money and the first to empty their hand takes it. Some tables also make the losers pay for each card they still hold.
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
        const need = t.need;
        return (
          <Panel key={t.id} title={t.name}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-mist">Pot money</dt>
                  <dd><Points value={t.ante} className="font-heading font-bold text-gold" /></dd>
                  <dd className="text-xs text-mist">{t.stake ? <>+ {t.stake.toLocaleString()} per card</> : "Pot only"}</dd>
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
            {!t.seated_here && balance < need && <p role="alert" className="mt-2 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">You need {need.toLocaleString()} points to play at this table ({t.stake ? <>{t.ante.toLocaleString()} pot money + 13 cards × {t.stake.toLocaleString()}</> : "the pot money"}) and you have {balance.toLocaleString()}.</p>}
          </Panel>
        );
      })}

      {!mine && (
        <Panel title="Open a table">
          <form onSubmit={(e) => { e.preventDefault(); if (formOk) run("create", { action: "create", ante: a, stake: n }); }} className="space-y-4">
            <div>
              <label className="label" htmlFor="pd-pot">Pot money (each player puts this in)</label>
              <input id="pd-pot" type="number" inputMode="numeric" min={limits.pot_min} max={limits.pot_max} className="field" value={pot} onChange={(e) => setPot(e.target.value)} required />
              <p className="mt-1 text-xs text-mist">Between {limits.pot_min.toLocaleString()} and {limits.pot_max.toLocaleString()}. The winner takes everyone's pot money.</p>
            </div>
            <div className="rounded-md border border-bronze/40 bg-black/25 p-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#C8161D]" checked={perCard} onChange={(e) => setPerCard(e.target.checked)} />
                <span>
                  <span className="font-bold">Losers also pay for cards left in hand</span>
                  <span className="block text-xs text-mist">Leave this off for a pot-only game.</span>
                </span>
              </label>
              {perCard && (
                <div className="mt-3">
                  <label className="label" htmlFor="pd-stake">Value per card left</label>
                  <input id="pd-stake" type="number" inputMode="numeric" min={1} max={limits.card_max} className="field" value={stake} onChange={(e) => setStake(e.target.value)} required />
                  <p className="mt-1 text-xs text-mist">Between 1 and {limits.card_max.toLocaleString()}.</p>
                </div>
              )}
            </div>
            {formOk && (
              <p className="text-xs text-mist">
                The most anyone can lose in one game is <span className="font-bold text-[hsl(var(--foreground))]">{needNew.toLocaleString()}</span>{perCard ? <> ({a.toLocaleString()} pot money + 13 cards × {n.toLocaleString()})</> : null}. Every player needs that much to sit down.
              </p>
            )}
            {formOk && balance < needNew && (
              <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">You need {needNew.toLocaleString()} points for this table and you have {balance.toLocaleString()}.</p>
            )}
            <button type="submit" disabled={!!busy || !formOk || balance < needNew || data.open === false} className="btn-seal h-11 w-full text-sm">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open table and sit down"}
            </button>
          </form>
        </Panel>
      )}

      <Panel title="How to play">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-mist">
          <li>Everyone is dealt 13 cards. Each player's highest card is shown on the table, and whoever shows the highest goes first. The cards stay in their hands.</li>
          <li>You play one card at a time. The first card sets the suit in game.</li>
          <li>The next player must play a card of that suit, or the same number in another suit, which changes the suit. Example: on the 4♠ you can play any spade, or the 4♣ to switch everyone to clubs.</li>
          <li>Nothing to play? Pass. When everyone else passes, the last player to play leads any card and sets a new suit.</li>
          <li>Every card played stays on the table so you can see what's gone.</li>
          <li>You have 20 seconds a turn. Run out and your turn is skipped. Three times in a row, or leaving mid-game, forfeits: you're out of the game, lose your pot money and pay for any cards you hold.</li>
          <li>The first player out wins the pot: everyone else's pot money. At tables with a card value, each loser also pays that value for every card left. 2% of the winnings is removed from circulation.</li>
        </ul>
      </Panel>
    </div>
  );
}