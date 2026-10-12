import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import { useAuth } from "@/lib/AuthContext";

// Shown when a signed-in member's account couldn't be loaded (usually a
// connection problem). Pages send people here instead of bouncing them around.
export default function AccountProblem() {
  const { account, loading, error, reload } = useGuild();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  // 6.16: keep trying quietly every 15 s while this page is open (a busy server usually clears in a minute)
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) reload(); }, 15000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading) return <LanternSpinner label="Checking your account" className="py-24" />;
  if (account && account.linked) return <Navigate to="/dashboard" replace />;

  const retry = async () => {
    setBusy(true);
    await reload();
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-10">
      <Panel title="Couldn't load your account">
        <p className="text-center text-sm text-mist">{error || "Something went wrong on our side."} We keep trying on our own; you can also try now.</p>
        <button onClick={retry} disabled={busy} className="btn-seal mt-5 h-12 w-full text-base">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Trying again</> : "Try again"}
        </button>
        <button onClick={() => logout()} className="btn-bronze mt-3 h-11 w-full text-sm">
          Sign out
        </button>
      </Panel>
    </div>
  );
}