import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import { Seal } from "@/components/SealLogo";

export default function LinkDiscord() {
  const { account, loading } = useGuild();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) return <LanternSpinner label="Checking your account" className="py-24" />;
  if (account && account.linked) return <Navigate to="/dashboard" replace />;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("discordAuthStart");
      if (res.data && res.data.url) {
        window.top.location.href = res.data.url;
      } else {
        setError("Could not start Discord linking.");
        setBusy(false);
      }
    } catch (e) {
      setError(e.message || "Could not start Discord linking.");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto pt-10">
      <Panel className="p-8 text-center">
        <div className="flex justify-center mb-5">
          <Seal size={56} />
        </div>
        <h1 className="font-heading text-2xl text-gold font-bold mb-2">Link your Discord</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Connect your Discord account to bind it to your guild points. You must be a member of the BLACKLIST INTROBOYS guild.
        </p>
        {error && <p className="text-ember text-sm mb-4">{error}</p>}
        <Button
          onClick={start}
          disabled={busy}
          className="w-full h-12 bg-crimson hover:bg-ember text-gold font-heading tracking-wider border border-gold/40"
        >
          {busy ? "Redirecting…" : "Link Discord"}
        </Button>
      </Panel>
    </div>
  );
}