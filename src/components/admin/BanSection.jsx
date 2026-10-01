import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import MemberSearch, { SelectedMember } from "./MemberSearch";
import { useGuild, errorText } from "@/lib/GuildContext";

// Ban or unban a member; the leader can also promote Elders (officers).
export default function BanSection() {
  const { account } = useGuild();
  const isLeader = account?.member?.role === "leader";
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const act = async (action, extra = {}, done) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await base44.functions.invoke("adminAction", { action, discordId: target.discord_id, ...extra });
      setMsg(done);
      setTarget((t) => ({
        ...t,
        ...(action === "ban" ? { banned: true } : action === "unban" ? { banned: false } : { role: extra.role })
      }));
    } catch (e) {
      setError(errorText(e, "That didn't work."));
    } finally {
      setBusy(false);
    }
  };

  const name = target ? target.discord_name || target.discord_id : "";

  return (
    <Panel title="Manage members">
      <p className="mb-3 text-sm text-mist">Banned members can't play games or spin the daily wheel. Their points stay.</p>
      {target ? <SelectedMember m={target} onClear={() => { setTarget(null); setMsg(""); }} /> : <MemberSearch onSelect={setTarget} />}

      {target && (
        <div className="mt-4 flex flex-wrap gap-2">
          {target.banned ? (
            <button disabled={busy} onClick={() => act("unban", {}, `${name} can play again.`)} className="btn-bronze h-10 px-4 text-sm">
              Lift ban
            </button>
          ) : (
            <button
              disabled={busy || target.role === "leader"}
              onClick={() => act("ban", {}, `${name} is banned from games.`)}
              className="btn-bronze h-10 px-4 text-sm !text-ember"
            >
              Ban from games
            </button>
          )}
          {isLeader && target.role === "member" && (
            <button disabled={busy} onClick={() => act("setRole", { role: "officer" }, `${name} is now an Elder.`)} className="btn-bronze h-10 px-4 text-sm">
              Make Elder
            </button>
          )}
          {isLeader && target.role === "officer" && (
            <button disabled={busy} onClick={() => act("setRole", { role: "member" }, `${name} is a Disciple again.`)} className="btn-bronze h-10 px-4 text-sm">
              Remove Elder rank
            </button>
          )}
        </div>
      )}
      {msg && <p role="status" className="mt-3 text-sm text-jade">{msg}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}
    </Panel>
  );
}