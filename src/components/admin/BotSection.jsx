import React, { useCallback, useEffect, useState } from "react";
import { Loader2, X, Gift } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import MemberSearch, { SelectedMember } from "./MemberSearch";
import { errorText } from "@/lib/GuildContext";
import { cn } from "@/lib/utils";

// Guild Leader: who holds an IntroBoys Assistant license, add or take away days, switch one off, move a PC.
export default function BotSection() {
  const [data, setData] = useState(null);
  const [target, setTarget] = useState(null);
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { const res = await base44.functions.invoke("botAuth", { action: "adminList" }); setData(res.data); }
    catch (e) { setError(errorText(e, "Couldn't load the Assistant licenses.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action, extra, done) => {
    setBusy(true); setError(""); setMsg("");
    try {
      await base44.functions.invoke("botAuth", { action, discordId: target.discord_id, ...extra });
      setMsg(done); await load();
    } catch (e) { setError(errorText(e, "That didn't work.")); }
    finally { setBusy(false); }
  };
  const name = target ? target.discord_name || target.discord_id : "";
  const mine = data && target ? data.licenses.find((l) => l.discord_id === target.discord_id) : null;

  return (
    <Panel title="IntroBoys Assistant licenses">
      <p className="mb-3 text-sm text-mist">Members buy days in the shop (add an item there with "Assistant days"). Here you can give or take days, switch a license off, or free its locked PC.</p>
      {target ? <SelectedMember m={target} onClear={() => { setTarget(null); setMsg(""); setError(""); }} /> : <MemberSearch onSelect={setTarget} />}
      {target && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-mist">
            {mine ? `${mine.active ? mine.days_left + " days left" : mine.revoked ? "Switched off" : "No active days"}${mine.device_bound ? ` · PC ${mine.device_tag}` : " · no PC locked yet"}` : "No license yet."}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="bot-days" className="label">Days to add (negative takes away)</label>
              <input id="bot-days" type="number" step="1" value={days} onChange={(e) => setDays(e.target.value)} className="field w-32" />
            </div>
            <button disabled={busy} onClick={() => act("adminGrant", { days: Number(days) }, `${days} days for ${name}.`)} className="btn-seal h-10 px-4 text-sm">Give days</button>
          </div>
          {mine && (
            <div className="flex flex-wrap items-end gap-2">
              {mine.revoked ? (
                <button disabled={busy} onClick={() => act("adminRestore", {}, `${name}'s license is back on.`)} className="btn-bronze h-10 px-4 text-sm">Switch back on</button>
              ) : (
                <>
                  <input aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="field w-56" />
                  <button disabled={busy} onClick={() => act("adminRevoke", { reason }, `${name}'s license is switched off and the app signed out.`)} className="btn-bronze h-10 px-4 text-sm !text-ember">Switch off</button>
                </>
              )}
              <button disabled={busy || !mine.device_bound} onClick={() => act("adminReset", {}, `${name}'s PC lock is cleared.`)} className="btn-bronze h-10 px-4 text-sm">Free the locked PC</button>
            </div>
          )}
          {msg && <p role="status" className="text-gold">{msg}</p>}
          {error && <p role="alert" className="text-ember">{error}</p>}
        </div>
      )}
      {!target && error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}

      <GiveMany onDone={load} />

      {data && (
        <details className="mt-4 text-sm" open>
          <summary className="cursor-pointer text-mist hover:text-gold">All licenses ({data.licenses.length})</summary>
          {busy && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
          <ul className="mt-2 divide-y divide-bronze/25">
            {data.licenses.map((l) => (
              <li key={l.member_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate font-bold text-gold">{l.member_name || l.discord_id}</span>
                <span className={cn("rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase", l.active ? "border-white/70 text-white" : "border-ember/60 text-ember")}>
                  {l.active ? `${l.days_left} d` : l.revoked ? "off" : "expired"}
                </span>
                <span className="text-xs text-mist">{l.device_bound ? `PC ${l.device_tag}` : "no PC"}{l.online ? " · running" : ""}</span>
              </li>
            ))}
          </ul>
          {data.events.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-mist hover:text-gold">Recent activity</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-mist">
                {data.events.map((e) => <li key={e.id}>{new Date(e.at).toLocaleString()} · {e.kind} · {e.discord_id} · {e.detail}</li>)}
              </ul>
            </details>
          )}
        </details>
      )}
    </Panel>
  );
}

// 6.31: give (or take) days to several members at once, or to every member with access: giveaways, events,
// guild rewards. Every member is done on their own; anyone who can't take the days is listed with the reason.
function GiveMany({ onDone }) {
  const [picked, setPicked] = useState([]);
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [everyone, setEveryone] = useState(null);   // null = not asked; number = members it would reach
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const n = Number(days);
  const okDays = Number.isInteger(n) && n !== 0 && Math.abs(n) <= 3650;
  const add = (m) => setPicked((p) => (p.some((x) => x.discord_id === m.discord_id) ? p : [...p, m]));

  const give = async (all) => {
    if (!okDays) { setError("Days must be a whole number (not 0)."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await base44.functions.invoke("botAuth", { action: "adminGrantMany", days: n, note, ...(all ? { everyone: true } : { discordIds: picked.map((m) => m.discord_id) }) });
      setResult(res.data);
      if (!all) setPicked([]);
      setConfirmAll(false);
      onDone && onDone();
    } catch (e) { setError(errorText(e, "That didn't work.")); }
    finally { setBusy(false); }
  };
  const askAll = async () => {
    setError(""); setResult(null);
    try { const res = await base44.functions.invoke("botAuth", { action: "adminCountAll" }); setEveryone(res.data.count); setConfirmAll(true); }
    catch (e) { setError(errorText(e, "Couldn't count the members.")); }
  };

  return (
    <div className="mt-5 border-t border-bronze/30 pt-4">
      <h3 className="flex items-center gap-2 font-heading text-base font-bold text-gold"><Gift className="h-4 w-4" /> Give days to members</h3>
      <p className="mt-1 text-sm text-mist">For giveaways and rewards: pick members (or everyone in the guild) and give them Assistant days. Days add on to what they already have. Negative days take time away.</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="bot-many-days" className="label">Days each</label>
          <input id="bot-many-days" type="number" step="1" value={days} onChange={(e) => setDays(e.target.value)} className="field w-24" />
        </div>
        {[1, 7, 30].map((d) => (
          <button key={d} type="button" onClick={() => setDays(String(d))} data-on={String(d) === days} className="btn-bronze h-10 px-3 text-sm">{d} day{d === 1 ? "" : "s"}</button>
        ))}
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="bot-many-note" className="label">Note (optional, kept in the log)</label>
          <input id="bot-many-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="e.g. guild war prize" className="field w-full" />
        </div>
      </div>

      <div className="mt-3">
        <MemberSearch onSelect={add} placeholder="Add a member: name or Discord ID" />
        {picked.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Members picked">
            {picked.map((m) => (
              <li key={m.discord_id} className="inline-flex items-center gap-1 rounded-full border border-bronze/60 bg-black/30 py-0.5 pl-2.5 pr-1 text-sm">
                {m.discord_name || m.discord_id}
                <button type="button" onClick={() => setPicked((p) => p.filter((x) => x.discord_id !== m.discord_id))} aria-label={`Remove ${m.discord_name || m.discord_id}`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !picked.length || !okDays} onClick={() => give(false)} className="btn-seal h-10 px-4 text-sm">
          {busy && !confirmAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Give {okDays ? n : "?"} day{n === 1 ? "" : "s"} to {picked.length || "the"} member{picked.length === 1 ? "" : "s"} picked
        </button>
        {!confirmAll && <button type="button" disabled={busy || !okDays} onClick={askAll} className="btn-bronze h-10 px-4 text-sm">Everyone in the guild…</button>}
      </div>

      {confirmAll && (
        <div role="alertdialog" aria-label="Give days to everyone" className="mt-3 rounded-md border border-crimson/60 bg-crimson/10 p-3 text-sm">
          <p>Give <b className="text-white">{n} day{n === 1 ? "" : "s"}</b> of Assistant time to <b className="text-white">all {everyone} members</b> who have the guild role (banned members are left out)?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => give(true)} className="btn-seal h-9 px-4 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Yes, give to {everyone}</button>
            <button type="button" disabled={busy} onClick={() => setConfirmAll(false)} className="btn-bronze h-9 px-4 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div role="status" className="mt-3 text-sm">
          <p className="text-gold">{result.days > 0 ? "Gave" : "Took"} {Math.abs(result.days)} day{Math.abs(result.days) === 1 ? "" : "s"} {result.days > 0 ? "to" : "from"} {result.given} member{result.given === 1 ? "" : "s"}.</p>
          {result.skipped && result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-ember">
              {result.skipped.map((x, i) => <li key={i}>{x.name}: {x.why}</li>)}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
    </div>
  );
}
