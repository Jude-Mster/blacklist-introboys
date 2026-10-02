import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import { errorText } from "@/lib/GuildContext";

// Shows whether the Discord points channel is connected and posts the rankings there.
export default function DiscordSection() {
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("adminAction", { action: "discordStatus" });
        setConnected(!!res.data.points_channel);
      } catch {
        setConnected(false);
      }
    })();
  }, []);

  const post = async () => {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      await base44.functions.invoke("adminAction", { action: "postRankings" });
      setMsg("Rankings posted in the Discord points channel.");
    } catch (e) {
      setError(errorText(e, "Couldn't post the rankings."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Discord points channel">
      {connected === null ? (
        <p className="flex items-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Checking</p>
      ) : connected ? (
        <>
          <p className="text-sm text-mist">
            <b className="text-jade">Connected.</b> Awards, deductions and raffle winners are posted there automatically, and the member is tagged.
          </p>
          <button onClick={post} disabled={busy} className="btn-bronze mt-3 h-10 px-5 text-sm">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Posting</> : "Post the rankings now"}
          </button>
        </>
      ) : (
        <p className="text-sm text-mist">
          <b className="text-ember">Not connected.</b> In Discord, open the points channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL. Save it in Base44 secrets as <code className="text-gold">DISCORD_POINTS_WEBHOOK_URL</code>, then publish.
        </p>
      )}
      {msg && <p role="status" className="mt-3 text-sm text-jade">{msg}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}
    </Panel>
  );
}