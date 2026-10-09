import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import CodeInput from "@/components/prizes/CodeInput";
import MemberSearch, { SelectedMember } from "./MemberSearch";
import { errorText } from "@/lib/GuildContext";
import { DM_TEXT, PLACE, codeHint, normalizeCode } from "@/lib/prizes";
import { cn } from "@/lib/utils";

// Guild Leader only: give prize codes (GP codes and the like) to members, keep a stock of
// codes for later, and see what was given. The page never shows a code once it is saved:
// only its last 4 characters. The member it is given to is the only one who can see it.
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function PrizeCodesSection() {
  const [tab, setTab] = useState("give");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("prizeAction", { action: "adminList" });
      setData(res.data || {});
      setError("");
    } catch (e) {
      setError(errorText(e, "Couldn't load the prize codes."));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const summary = (data && data.summary) || [];
  const waiting = (data && data.waiting) || [];
  const tabs = [["give", "Give a code"], ["stock", `Stock (${summary.reduce((a, x) => a + x.count, 0)})`], ["history", `Given (${data ? (data.given || []).length : 0})`]];

  return (
    <Panel title="Prize codes">
      <p className="flex items-start gap-2 text-[15px] text-[#c4c4c4]">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#e8c15a]" aria-hidden="true" />
        Codes are sent privately to the member on the site and by Discord DM, with a phone notification if they turned those on. Once saved, a code is only ever shown to the member it was given to; here you see its last 4 characters.
      </p>

      {waiting.length > 0 && <Waiting rows={waiting} onDone={load} />}

      <div className="mt-4 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Prize codes">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-on={tab === id} onClick={() => setTab(id)} className="btn-bronze h-10 px-1 text-[13px] sm:text-sm">{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-[15px] text-ember">{error}</p>}
      <div className="mt-4">
        {data === null ? (
          <p className="flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : tab === "give" ? (
          <GiveCode summary={summary} onDone={load} />
        ) : tab === "stock" ? (
          <Stock rows={data.stock || []} summary={summary} reserved={data.reserved || []} onDone={load} />
        ) : (
          <History rows={data.given || []} onDone={load} />
        )}
      </div>
    </Panel>
  );
}

// ---------- Give a code ----------
function GiveCode({ summary, onDone }) {
  const [target, setTarget] = useState(null);
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("type");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const stockCount = (() => {
    const hit = summary.find((x) => x.label.toLowerCase() === label.trim().replace(/\s+/g, " ").toLowerCase());
    return hit ? hit.count : 0;
  })();
  const ready = target && label.trim() && (mode === "stock" ? stockCount > 0 : codeHint(code).ok);

  const send = async () => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await base44.functions.invoke("prizeAction", {
        action: "give", discord_id: target.discord_id, label: label.trim(), reason: reason.trim(),
        ...(mode === "stock" ? { from_stock: true } : { code })
      });
      const pz = res.data.prize;
      setDone(`Sent ${pz.label} (ends in ${pz.last4}) to ${target.discord_name || target.discord_id}: on the site${pz.dm_status === "sent" ? ", by Discord DM" : ""}${pz.push_sent ? " and to their phone" : ""}.${pz.dm_status && pz.dm_status !== "sent" ? ` ${DM_TEXT[pz.dm_status] || ""}; they will still see it on the site.` : ""}`);
      setCode("");
      setReason("");
      setTarget(null);
      setConfirm(false);
      onDone();
    } catch (e) {
      setError(errorText(e, "Couldn't send the code."));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="label">Member</p>
        {target ? <SelectedMember m={target} onClear={() => { setTarget(null); setConfirm(false); }} /> : <MemberSearch onSelect={(m) => { setTarget(m); setConfirm(false); }} />}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pc-label" className="label">Prize name</label>
          <input id="pc-label" className="field" maxLength={80} value={label} onChange={(e) => { setLabel(e.target.value); setConfirm(false); }} placeholder="500 GP Code" list="pc-stock-names" />
          <datalist id="pc-stock-names">{summary.map((x) => <option key={x.label} value={x.label} />)}</datalist>
        </div>
        <div>
          <label htmlFor="pc-reason" className="label">What it's for (the member sees this)</label>
          <input id="pc-reason" className="field" maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="HSB top damage, Oct 11" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-on={mode === "type"} onClick={() => { setMode("type"); setConfirm(false); }} className="btn-bronze h-10 px-3 text-sm">Type the code</button>
        <button type="button" data-on={mode === "stock"} onClick={() => { setMode("stock"); setConfirm(false); }} className="btn-bronze h-10 px-3 text-sm">From stock ({stockCount})</button>
      </div>
      {mode === "type" ? (
        <CodeInput value={code} onChange={(v) => { setCode(v); setConfirm(false); }} />
      ) : (
        <p className={cn("text-[14px]", stockCount ? "text-[#6fd3a2]" : "text-ember")}>
          {stockCount ? `Sends the oldest "${label.trim()}" code in stock (${stockCount} left).` : label.trim() ? `No "${label.trim()}" codes in stock.` : "Type the prize name exactly as it is in stock."}
        </p>
      )}
      {confirm ? (
        <div className="rounded-md border border-[#d4a72c] bg-[#1f1508] p-3 text-[15px]">
          <p>Send <b>{label.trim()}</b> to <b>{target.discord_name || target.discord_id}</b>? It goes to them straight away and can't be taken back (you can replace a wrong code).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={send} disabled={busy} className="btn-seal h-11 px-4 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, send it"}</button>
            <button type="button" onClick={() => setConfirm(false)} disabled={busy} className="btn-bronze h-11 px-4 text-sm">Not yet</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} disabled={!ready} className="btn-seal h-11 w-full text-sm">Send code</button>
      )}
      {error && <p role="alert" className="text-[15px] text-ember">{error}</p>}
      {done && <p role="status" className="text-[15px] text-jade">{done}</p>}
    </div>
  );
}

// ---------- Stock ----------
function Stock({ rows, summary, reserved, onDone }) {
  const [label, setLabel] = useState("");
  const [codes, setCodes] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const lines = codes.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

  const add = async () => {
    setBusy("add");
    setError("");
    setDone("");
    try {
      const res = await base44.functions.invoke("prizeAction", { action: "addStock", label: label.trim(), codes });
      const d = res.data;
      setDone(`Added ${d.added} code${d.added === 1 ? "" : "s"} to "${label.trim()}".${d.skipped.length ? ` Skipped ${d.skipped.length}: ${d.skipped.map((x) => `…${x.last4} (${x.why})`).join(", ")}` : ""}`);
      setCodes("");
      onDone();
    } catch (e) {
      setError(errorText(e, "Couldn't add the codes."));
    } finally {
      setBusy("");
    }
  };
  const remove = async (id) => {
    setBusy(id);
    setError("");
    try {
      await base44.functions.invoke("prizeAction", { action: "removeStock", id });
      onDone();
    } catch (e) {
      setError(errorText(e, "Couldn't remove it."));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border border-bronze/50 bg-black/20 p-3">
        <p className="font-heading text-[15px] tracking-[0.1em] text-white">ADD CODES TO STOCK</p>
        <div>
          <label htmlFor="st-label" className="label">Prize name</label>
          <input id="st-label" className="field" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="500 GP Code" list="st-names" />
          <datalist id="st-names">{summary.map((x) => <option key={x.label} value={x.label} />)}</datalist>
        </div>
        <div>
          <label htmlFor="st-codes" className="label">Codes, one per line</label>
          <textarea
            id="st-codes"
            className="field min-h-[7rem] py-2 font-heading tracking-[0.1em]"
            style={{ WebkitTextSecurity: "disc" }}
            value={codes}
            onChange={(e) => setCodes(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            placeholder="Paste the codes here"
          />
          <p className="mt-1 text-[13px] text-mist">{lines.length ? `${lines.length} code${lines.length === 1 ? "" : "s"} ready to add. The same code is never added twice.` : "Hidden as you paste. Up to 200 at a time."}</p>
        </div>
        <button type="button" onClick={add} disabled={!!busy || !label.trim() || !lines.length} className="btn-seal h-11 w-full text-sm">
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${lines.length || ""} to stock`}
        </button>
        {error && <p role="alert" className="text-[15px] text-ember">{error}</p>}
        {done && <p role="status" className="text-[15px] text-jade">{done}</p>}
      </div>

      {summary.length === 0 ? (
        <p className="text-[15px] text-[#c4c4c4]">No codes in stock yet.</p>
      ) : (
        summary.map((g) => (
          <div key={g.label}>
            <p className="mb-2 font-heading text-base text-white">{g.label} <span className="text-[#c4c4c4]">· {g.count} in stock</span></p>
            <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
              {rows.filter((r) => r.label.toLowerCase() === g.label.toLowerCase()).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                  <span className="font-heading tracking-[0.12em] text-white">•••• •••• •••• {r.last4}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[#c4c4c4]">added {when(r.created_date)}</span>
                  <button type="button" onClick={() => remove(r.id)} disabled={!!busy} className="btn-bronze h-9 w-9 shrink-0" aria-label={`Remove the code ending in ${r.last4}`}>
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {reserved.length > 0 && (
        <div>
          <p className="mb-2 font-heading text-base text-white">Set aside for raffles</p>
          <ul className="space-y-1 text-[15px] text-[#c4c4c4]">
            {reserved.map((r) => <li key={r.id}>{r.label} · ends in {r.last4}{r.raffle_title ? ` · ${PLACE[(r.place || 1) - 1]} prize of "${r.raffle_title}"` : ""}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Given ----------
function History({ rows, onDone }) {
  const [busy, setBusy] = useState("");
  const [replacing, setReplacing] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState({});

  const act = async (id, payload, ok) => {
    setBusy(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await base44.functions.invoke("prizeAction", { ...payload, id });
      setMsg((m) => ({ ...m, [id]: ok(res.data.prize) }));
      setReplacing("");
      setCode("");
      onDone();
    } catch (e) {
      setMsg((m) => ({ ...m, [id]: errorText(e, "That didn't work.") }));
    } finally {
      setBusy("");
    }
  };

  if (!rows.length) return <p className="text-[15px] text-[#c4c4c4]">No codes given yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-heading text-base font-semibold text-white">{r.label} → {r.member_name}</span>
            <span className="text-sm text-[#c4c4c4]">ends in {r.last4} · {when(r.assigned_at)}</span>
          </div>
          <p className="mt-0.5 text-sm text-[#c4c4c4]">{r.source === "raffle" ? `${PLACE[(r.place || 1) - 1]} prize, raffle "${r.raffle_title}"` : r.reason ? `For: ${r.reason}` : "Given from the admin hall"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
            <Chip ok>On the site</Chip>
            <Chip ok={r.dm_status === "sent"} bad={r.dm_status && r.dm_status !== "sent" && r.dm_status !== "pending"}>{DM_TEXT[r.dm_status] || "Discord DM"}</Chip>
            {r.push_sent && <Chip ok>Phone notified</Chip>}
            <Chip ok={!!r.opened_at} gold={!!r.opened_at}>{r.opened_at ? `Opened ${when(r.opened_at)}` : "Not opened yet"}</Chip>
            <Chip ok={!!r.redeemed_at}>{r.redeemed_at ? "Marked redeemed" : "Not marked redeemed"}</Chip>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {r.dm_status !== "sent" && (
              <button type="button" onClick={() => act(r.id, { action: "retryDm" }, (p) => (p.dm_status === "sent" ? "Discord DM sent." : `${DM_TEXT[p.dm_status] || "Not sent"}. They can still see it on the site.`))} disabled={!!busy} className="btn-bronze h-9 px-3 text-sm">
                {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try DM again"}
              </button>
            )}
            {replacing !== r.id && <button type="button" onClick={() => { setReplacing(r.id); setCode(""); }} disabled={!!busy} className="btn-bronze h-9 px-3 text-sm">Replace code</button>}
          </div>
          {replacing === r.id && (
            <div className="mt-3 space-y-2 rounded-md border border-[#6b5420] bg-[#140f06] p-3">
              <CodeInput value={code} onChange={setCode} label="The correct code (sent to them again right away)" autoFocus />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => act(r.id, { action: "replace", code }, (p) => `Replaced. The code ending in ${p.last4} was sent again.`)} disabled={!!busy || !codeHint(code).ok} className="btn-seal h-10 px-4 text-sm">
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace and send"}
                </button>
                <button type="button" onClick={() => setReplacing("")} className="btn-bronze h-10 px-4 text-sm">Cancel</button>
              </div>
            </div>
          )}
          {msg[r.id] && <p role="status" className="mt-2 text-sm text-[#c4c4c4]">{msg[r.id]}</p>}
        </li>
      ))}
    </ul>
  );
}

function Chip({ ok, bad, gold, children }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1", bad ? "bg-[#2a0a0c] text-[#ff8a8a]" : gold ? "bg-[#1f1a0a] text-[#e8c15a]" : ok ? "bg-[#0e2a1e] text-[#6fd3a2]" : "bg-[#222] text-[#c4c4c4]")}>{children}</span>
  );
}

// ---------- Raffle winners still waiting for their code ----------
function Waiting({ rows, onDone }) {
  const [open, setOpen] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = (w) => `${w.raffle_id}:${w.place}`;

  const send = async (w, fromStock) => {
    setBusy(true);
    setError("");
    try {
      await base44.functions.invoke("raffleAction", { action: "setPrizeCode", raffleId: w.raffle_id, place: w.place, ...(fromStock ? { from_stock: true } : { code: normalizeCode(code) }) });
      setOpen("");
      setCode("");
      onDone();
    } catch (e) {
      setError(errorText(e, "Couldn't send the code."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-[#d4a72c] bg-[#1f1508] p-3">
      <p className="font-heading text-[15px] tracking-[0.1em] text-[#e8c15a]">WAITING FOR A CODE</p>
      <ul className="mt-2 space-y-2">
        {rows.map((w) => (
          <li key={key(w)} className="text-[15px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">{w.member_name} won the {PLACE[w.place - 1]} prize ({w.prize}) in "{w.raffle_title}".</span>
              {open !== key(w) && <button type="button" onClick={() => { setOpen(key(w)); setCode(""); setError(""); }} className="btn-seal h-9 px-3 text-sm">Add code and send</button>}
            </div>
            {open === key(w) && (
              <div className="mt-2 space-y-2">
                <CodeInput value={code} onChange={setCode} label={`Code for ${w.member_name}`} autoFocus />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => send(w, false)} disabled={busy || !codeHint(code).ok} className="btn-seal h-10 px-4 text-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to the winner"}</button>
                  <button type="button" onClick={() => send(w, true)} disabled={busy} className="btn-bronze h-10 px-4 text-sm">Use one from stock</button>
                  <button type="button" onClick={() => setOpen("")} className="btn-bronze h-10 px-4 text-sm">Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-[15px] text-ember">{error}</p>}
    </div>
  );
}