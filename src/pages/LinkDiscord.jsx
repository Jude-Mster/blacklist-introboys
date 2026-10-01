import React, { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { Seal } from "@/components/SealLogo";
import { Loader2 } from "lucide-react";

const ERRORS = {
  not_in_guild: {
    title: "You're not in our Discord server yet",
    body: "Join the BLACKLIST INTROBOYS server with the same Discord account, then link again. Check that the account on Discord's Authorize screen is yours.",
    invite: true
  },
  guild_not_set: {
    title: "The guild hall isn't set up yet",
    body: "The guild leader needs to finish setup before members can link. Let them know, then try again later."
  },
  cancelled: {
    title: "Linking was cancelled",
    body: "You pressed Cancel on Discord. Link again when you're ready."
  },
  state: {
    title: "That link expired",
    body: "The Discord login took too long or was opened twice. Start again below."
  },
  token: {
    title: "Discord didn't accept the login",
    body: "Try again. If it keeps happening, the guild leader should check the Discord redirect and client secret."
  },
  busy: {
    title: "Discord is busy",
    body: "Discord asked us to slow down. Wait a minute and try again."
  },
  server: {
    title: "Something went wrong on our side",
    body: "Try again in a moment. If it keeps happening, tell the guild leader."
  }
};

export default function LinkDiscord() {
  const { account, loading } = useGuild();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const problem = ERRORS[params.get("error")];

  if (loading) return <LanternSpinner label="Checking your account" className="py-24" />;
  if (account && account.linked) return <Navigate to="/dashboard" replace />;
  const invite = account && account.invite_url;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("discordAuthStart");
      if (res.data && res.data.url) {
        // Discord refuses to load inside a frame, so always leave at the top level.
        window.top.location.href = res.data.url;
      } else {
        setError("Couldn't start Discord linking. Try again.");
        setBusy(false);
      }
    } catch (e) {
      setError(errorText(e, "Couldn't start Discord linking."));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-10">
      <Panel title="Link your Discord">
        <div className="flex flex-col items-center text-center">
          <Seal size={56} className="my-2" />

          {problem ? (
            <div role="alert" className="mt-4 w-full rounded-md border border-ember/40 bg-ember/10 p-4 text-left">
              <p className="font-heading font-bold text-[hsl(var(--foreground))]">{problem.title}</p>
              <p className="mt-1 text-sm text-mist">{problem.body}</p>
              {problem.invite && invite && (
                <a href={invite} target="_top" rel="noreferrer" className="btn-bronze mt-3 h-10 w-full text-sm">
                  Join our Discord server
                </a>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[15px] text-mist">
              Your Discord account is your key to the hall. We use it to find your points and check that you're in our server.
            </p>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-ember">{error}</p>}

          <button onClick={start} disabled={busy} className="btn-seal mt-6 h-12 w-full text-base">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Discord</> : problem ? "Link Discord again" : "Link Discord"}
          </button>

          <p className="mt-4 text-xs text-mist/80">We only see your name, avatar and which servers you're in. We can't read your messages.</p>
        </div>
      </Panel>
    </div>
  );
}