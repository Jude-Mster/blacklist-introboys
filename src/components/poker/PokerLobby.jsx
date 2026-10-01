import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import BuyIn from "./BuyIn";

export default function PokerLobby() {
  const { account, reload } = useGuild();
  const navigate = useNavigate();
  const [tables, setTables] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // table id with buy-in open
  const isLeader = account?.member?.role === "leader";

  const load = async () => {
    try {
      const res = await base44.functions.invoke("pokerAction", { action: "list" });
      setTables(res.data.tables || []);
      setError("");
    } catch (e) {
      setError(errorText(e, "Couldn't open the poker room."));
      setTables([]);
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const join = async (table, buyin) => {
    await base44.functions.invoke("pokerAction", { action: "join", tableId: table.id, buyin });
    reload();
    navigate(`/poker/${table.id}`);
  };

  if (!tables) return <LanternSpinner label="Shuffling the decks" className="py-24" />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="space-y-5">
        <header>
          <h1 className="font-heading text-3xl font-extrabold gilt-text">Poker room</h1>
          <p className="mt-1 text-sm text-mist">
            No-limit Texas Hold'em against other members. Buy in with points; whatever is in front of you comes back when you leave.
          </p>
        </header>

        {error && <p role="alert" className="text-sm text-ember">{error}</p>}

        {tables.map((t) => (
          <Panel key={t.id} title={t.name}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-mist">Blinds</dt>
                  <dd className="font-heading font-bold text-gold tabular-nums">{t.small_blind}/{t.big_blind}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Buy-in</dt>
                  <dd className="tabular-nums">{t.min_buyin.toLocaleString()}–{t.max_buyin.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Players</dt>
                  <dd className="flex items-center gap-1 tabular-nums">
                    <Users className="h-3.5 w-3.5 text-mist" /> {t.players}/{t.max_seats}
                  </dd>
                </div>
              </dl>
              {t.seated_here ? (
                <Link to={`/poker/${t.id}`} className="btn-seal h-10 px-5 text-sm">Back to your seat</Link>
              ) : (
                <div className="flex gap-2">
                  <Link to={`/poker/${t.id}`} className="btn-bronze h-10 px-4 text-sm">Watch</Link>
                  <button
                    onClick={() => setOpen(open === t.id ? null : t.id)}
                    disabled={t.players >= t.max_seats}
                    className="btn-seal h-10 px-5 text-sm"
                  >
                    {t.players >= t.max_seats ? "Table full" : "Take a seat"}
                  </button>
                </div>
              )}
            </div>
            {open === t.id && (
              <BuyIn
                table={t}
                balance={account.member.points}
                onCancel={() => setOpen(null)}
                onConfirm={(amount) => join(t, amount)}
              />
            )}
          </Panel>
        ))}

        {isLeader && <NewTable onCreated={load} />}
      </div>

    </div>
  );
}

function NewTable({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", small_blind: 10, big_blind: 20, min_buyin: 400, max_buyin: 4000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await base44.functions.invoke("pokerAction", { action: "createTable", ...f });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(errorText(err, "Couldn't open the table."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-bronze h-11 w-full text-sm">
        Open a new table
      </button>
    );
  }
  return (
    <Panel title="Open a new table">
      <form onSubmit={create} className="space-y-3">
        <div>
          <label className="label" htmlFor="nt-name">Table name</label>
          <input id="nt-name" className="field" value={f.name} onChange={set("name")} placeholder="Moonlit Gate" maxLength={40} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["small_blind", "Small blind"],
            ["big_blind", "Big blind"],
            ["min_buyin", "Minimum buy-in"],
            ["max_buyin", "Maximum buy-in"]
          ].map(([k, label]) => (
            <div key={k}>
              <label className="label" htmlFor={`nt-${k}`}>{label}</label>
              <input id={`nt-${k}`} type="number" className="field" value={f[k]} onChange={set(k)} required />
            </div>
          ))}
        </div>
        <p className="text-xs text-mist">The minimum buy-in must be at least 10 big blinds.</p>
        {error && <p role="alert" className="text-sm text-ember">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="btn-seal h-10 px-5 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open table"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-bronze h-10 px-4 text-sm">Cancel</button>
        </div>
      </form>
    </Panel>
  );
}