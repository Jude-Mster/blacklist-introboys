import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import MemberSearch, { SelectedMember } from "./MemberSearch";
import { useGuild, errorText } from "@/lib/GuildContext";

export default function AwardSection() {
  const { reload, account, settings } = useGuild();
  const isLeader = account?.member?.role === "leader";
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!target) return setError("Choose a member first.");
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const amt = Number(amount);
      const res = await base44.functions.invoke("awardPoints", { discordId: target.discord_id, amount: amt, reason });
      setMsg(`${amt > 0 ? "Awarded" : "Took"} ${Math.abs(amt).toLocaleString()} points ${amt > 0 ? "to" : "from"} ${res.data.name}. New balance: ${res.data.balance.toLocaleString()}.`);
      setAmount("");
      setReason("");
      setTarget(null);
      reload();
    } catch (err) {
      setError(errorText(err, "The award didn't go through."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Award points">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="label">Member</p>
          {target ? <SelectedMember m={target} onClear={() => setTarget(null)} /> : <MemberSearch onSelect={setTarget} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <div>
            <label htmlFor="award-amount" className="label">Points</label>
            <input
              id="award-amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="field font-bold text-gold"
              required
            />
          </div>
          <div>
            <label htmlFor="award-reason" className="label">Reason</label>
            <input
              id="award-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Guild war MVP, boss raid, helping a new member"
              className="field"
              maxLength={120}
              required
            />
          </div>
        </div>
        <p className="text-xs text-mist">
          {isLeader
            ? "As Guild Master you can also enter a negative number to take points away."
            : `Elders can give up to ${(settings?.award_cap_per_day || 0).toLocaleString()} points per 24 hours.`}
        </p>
        {msg && <p role="status" className="text-sm text-jade">{msg}</p>}
        {error && <p role="alert" className="text-sm text-ember">{error}</p>}
        <button type="submit" disabled={busy} className="btn-seal h-11 px-6">
          {busy ? "Awarding" : "Award points"}
        </button>
      </form>
    </Panel>
  );
}