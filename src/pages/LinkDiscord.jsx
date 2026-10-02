import React, { useState, useEffect, useCallback } from "react";
import { Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild, errorText } from "@/lib/GuildContext";
import { useAuth } from "@/lib/AuthContext";
import { Seal } from "@/components/SealLogo";
import { Loader2, Check, Copy } from "lucide-react";

const ERRORS = {
  not_in_guild: {
    title: "Members only",
    body: "This site is for BLACKLIST INTROBOYS guild members. To get access, join our Discord server and contact guild leader Juts to join the guild, then link your Discord again.",
    invite: true
  },
  no_role: {
    title: "Members only",
    body: "This site is for BLACKLIST INTROBOYS guild members. To get access, join our Discord server and contact guild leader Juts to join the guild, then link your Discord again.",
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
  already_linked: {
    title: "This Discord is already linked",
    body: "That Discord account is linked to another site member. Ask the Guild Leader to unlink it first, then try again."
  },
  not_owner_leader: {
    title: "Talk to the Guild Leader",
    body: "Your account is marked as Guild Leader but you aren't the owner of our Discord server. Contact the Guild Leader to fix this before linking."
  },
  wrong_account: {
    title: "This isn't your link",
    body: "This linking link was started from a different site account. Start Discord linking from your own account below."
  },
  server: {
    title: "Something went wrong on our side",
    body: "Try again in a moment. If it keeps happening, tell the guild leader."
  }
};

// discord.gg short-links are captured by the Discord app's Android intent
// filter and silently fail to open inside the installed app (TWA/WebView).
// discord.com/invite/<code> is a regular HTTPS page that opens reliably.
function normalizeInvite(url) {
  if (!url) return "";
  const m = String(url).match(/^https?:\/\/(?:www\.)?discord\.gg\/([A-Za-z0-9]+)/i);
  return m ? `https://discord.com/invite/${m[1]}` : String(url);
}

export default function LinkDiscord() {
  const { account, loading, reload } = useGuild();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [needConfirm, setNeedConfirm] = useState(false);
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const code = params.get("code");
  const state = params.get("state");
  const denied = account && account.denied === "no_role";
  const problem = ERRORS[params.get("error")] || (denied ? ERRORS.no_role : null);

  // Discord redirected back with ?code&state. discordLinkComplete links the
  // Discord account to the site account signed in on THIS browser. If linking was
  // started on a different session (e.g. the installed app), it first asks us to
  // confirm, and we show the confirm card below.
  const complete = useCallback(async (confirm) => {
    if (!code || !state) return;
    setCompleting(true);
    setError("");
    try {
      const res = await base44.functions.invoke("discordLinkComplete", { code, state, confirm });
      const data = res.data || {};
      if (data.confirm_needed) {
        setNeedConfirm(true);
        return;
      }
      setNeedConfirm(false);
      if (!data.redirect) {
        setError("Couldn't finish linking. Try again.");
        return;
      }
      if (data.redirect.startsWith("/dashboard")) {
        await reload();
        navigate("/dashboard", { replace: true });
      } else {
        // an error path on this page - replace so the error card shows
        navigate(data.redirect, { replace: true });
      }
    } catch (e) {
      setNeedConfirm(false);
      setError(errorText(e, "Couldn't finish linking. Try again."));
    } finally {
      setCompleting(false);
    }
  }, [code, state, reload, navigate]);

  useEffect(() => {
    if (code && state) complete(false);
  }, [code, state, complete]);

  if (loading) return <LanternSpinner label="Checking your account" className="py-24" />;
  if (completing) return <LanternSpinner label="Finishing your link" className="py-24" />;
  if (account && account.linked) return <Navigate to="/dashboard" replace />;

  if (needConfirm) {
    const who = (user && (user.email || user.full_name)) || "the account signed in here";
    return (
      <div className="mx-auto max-w-md pt-4 sm:pt-10">
        <Panel title="Link your Discord">
          <div className="flex flex-col items-center text-center">
            <Seal size={56} className="my-2" />
            <div role="status" className="mt-4 w-full rounded-md border border-bronze/60 bg-panel p-4 text-left">
              <p className="font-heading font-bold text-gold">Finish linking on this account?</p>
              <p className="mt-1 text-sm text-mist">
                Discord linking was started somewhere else (for example in the app or another browser). Here you are signed in as <b className="text-white">{who}</b>.
              </p>
              <p className="mt-2 text-sm text-mist">
                Only continue if you started this yourself. Your Discord account will be linked to this site account.
              </p>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-ember">{error}</p>}
            <button onClick={() => complete(true)} className="btn-seal mt-6 h-12 w-full text-base">
              Link Discord to this account
            </button>
            <button onClick={() => { setNeedConfirm(false); navigate("/link-discord", { replace: true }); }} className="btn-bronze mt-3 h-11 w-full text-sm">
              Cancel
            </button>
          </div>
        </Panel>
      </div>
    );
  }
  const invite = normalizeInvite(account && account.invite_url);

  const copyInvite = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(invite);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = invite;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  const recheck = async () => {
    setChecking(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getMyAccount", { recheck: true });
      if (res.data && res.data.linked) await reload();
      else setError("Still no guild member role on your Discord account. Ask the Guild Leader, then try again.");
    } catch (e) {
      setError(errorText(e, "Couldn't check right now. Try again in a moment."));
    } finally {
      setChecking(false);
    }
  };

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
            <div role="status" className="mt-4 w-full rounded-md border border-bronze/60 bg-panel p-4 text-left">
              <p className="font-heading font-bold text-gold">{problem.title}</p>
              <p className="mt-1 text-sm text-mist">{problem.body}</p>
              {problem.invite && invite && (
                <div className="mt-3 w-full">
                  <a href={invite} target="_blank" rel="noopener noreferrer" className="btn-bronze h-10 w-full text-sm">
                    Join our Discord server
                  </a>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 truncate rounded border border-bronze/60 bg-ink px-2 py-1.5 text-xs text-mist">{invite}</span>
                    <button type="button" onClick={copyInvite} className="btn-bronze h-9 shrink-0 px-3 text-xs">
                      {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy invite link</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[15px] text-mist">Your Discord account is your key to gain access to the website. We use it to find your points and check that you're in our server.</p>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-ember">{error}</p>}

          <button onClick={start} disabled={busy} className="btn-seal mt-6 h-12 w-full text-base">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Discord</> : problem ? (problem.invite ? "Try again" : "Link Discord again") : "Link Discord"}
          </button>

          {denied && (
            <button onClick={recheck} disabled={checking} className="btn-bronze mt-3 h-11 w-full text-sm">
              {checking ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking</> : "I have the role now, check again"}
            </button>
          )}

          <p className="mt-4 text-xs text-mist/80">We only see your name, avatar, which servers you're in and your roles in our server. We can't read your messages.</p>
        </div>
      </Panel>
    </div>
  );
}