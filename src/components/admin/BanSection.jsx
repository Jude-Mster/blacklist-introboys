import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/Panel";
import MemberSearch from "./MemberSearch";
import { useGuild } from "@/lib/GuildContext";

export default function BanSection() {
  const { reload } = useGuild();
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const act = async (ban) => {
    if (!target) { setError("Select a member first."); return; }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await base44.functions.invoke("adminAction", { action: ban ? "ban" : "unban", discordId: target.discord_id });
      setMsg(`${ban ? "Banned" : "Unbanned"} ${target.discord_name || target.discord_id}.`);
      setTarget(null);
      await reload();
    } catch (e) {
      const data = e && e.response && e.response.data;
      setError(data && data.error ? data.error : e.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6">
      <h2 className="font-heading text-xl text-gold font-bold mb-1">Ban / unban</h2>
      <p className="text-sm text-muted-foreground mb-4">Banned members cannot play games or claim daily rewards.</p>
      <MemberSearch onSelect={setTarget} />
      {target && <p className="text-xs text-gold mt-2">Selected: {target.discord_name || target.discord_id}{target.banned ? " (banned)" : ""}</p>}
      {msg && <p className="text-jade text-sm mt-3">{msg}</p>}
      {error && <p className="text-ember text-sm mt-3">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => act(true)} disabled={busy} variant="outline" className="border-ember/50 text-ember hover:bg-ember/10">Ban</Button>
        <Button onClick={() => act(false)} disabled={busy} variant="outline" className="border-jade/50 text-jade hover:bg-jade/10">Unban</Button>
      </div>
    </Panel>
  );
}