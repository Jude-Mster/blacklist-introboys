import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Panel from "@/components/Panel";
import MemberSearch from "./MemberSearch";
import { useGuild } from "@/lib/GuildContext";

export default function AwardSection() {
  const { reload } = useGuild();
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!target) { setError("Select a member first."); return; }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await base44.functions.invoke("awardPoints", {
        discordId: target.discord_id,
        amount: Number(amount),
        reason
      });
      setMsg(`Done. New balance: ${res.data.balance.toLocaleString()}`);
      setAmount("");
      setReason("");
      setTarget(null);
      await reload();
    } catch (e) {
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Award failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6">
      <h2 className="font-heading text-xl text-gold font-bold mb-1">Award points</h2>
      <p className="text-sm text-muted-foreground mb-4">Search a member, set an amount and a required reason.</p>

      <div className="space-y-3">
        <div>
          <Label className="text-muted-foreground">Member</Label>
          <div className="mt-1"><MemberSearch onSelect={setTarget} /></div>
          {target && <p className="text-xs text-gold mt-1">Selected: {target.discord_name || target.discord_id}</p>}
        </div>
        <div>
          <Label htmlFor="amt" className="text-muted-foreground">Amount</Label>
          <Input id="amt" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 bg-ink/60 border-gold/30 text-gold tabular-nums" />
        </div>
        <div>
          <Label htmlFor="rsn" className="text-muted-foreground">Reason</Label>
          <Input id="rsn" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 bg-ink/60 border-gold/30 text-gold" />
        </div>
      </div>

      {msg && <p className="text-jade text-sm mt-3">{msg}</p>}
      {error && <p className="text-ember text-sm mt-3">{error}</p>}

      <Button onClick={submit} disabled={busy} className="mt-4 bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40">
        {busy ? "Awarding…" : "Award"}
      </Button>
    </Panel>
  );
}