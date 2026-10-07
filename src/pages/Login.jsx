import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Check, Copy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";
import LanternSpinner from "@/components/LanternSpinner";
import { errorText } from "@/lib/GuildContext";
import {
  getSessionToken, setSessionToken, newLoginNonce, getLoginNonce, clearLoginNonce, getInvite, setInvite
} from "@/lib/session";

// The only way in: Continue with Discord. Discord tells us who you are, the
// server checks you're a guild member, and your profile is created for you.
// Non-members are not signed in; they see the "Members only" card.

const MEMBERS_ONLY = {
  title: "Members only",
  body: "This site is for BLACKLIST INTROBOYS guild members. To get access, join our Discord server and contact guild leader Juts to join the guild, then link your Discord again.",
  invite: true
};

const ERRORS = {
  not_in_guild: MEMBERS_ONLY,
  no_role: MEMBERS_ONLY,
  guild_not_set: {
    title: "The guild hall isn't set up yet",
    body: "The guild leader needs to finish setup before members can link their Discord. Let them know, then try again later."
  },
  cancelled: {
    title: "Linking was cancelled",
    body: "You pressed Cancel on Discord. Link your Discord again when you're ready."
  },
  state: {
    title: "That link expired",
    body: "The Discord link took too long or was opened twice. Start again below."
  },
  token: {
    title: "Discord didn't accept the link",
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

// discord.gg short-links are captured by the Discord app's Android intent
// filter and silently fail to open inside the installed app (TWA/WebView).
// discord.com/invite/<code> is a regular HTTPS page that opens reliably.
function normalizeInvite(url) {
  if (!url) return "";
  const m = String(url).match(/^https?:\/\/(?:www\.)?discord\.gg\/([A-Za-z0-9-]+)/i);
  return m ? `https://discord.com/invite/${m[1]}` : String(url);
}

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code");
  const state = params.get("state");
  const problem = ERRORS[params.get("error")] || null;

  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(!!(code && state));
  const [confirm, setConfirm] = useState(null); // { name, avatar } when the server asks us to confirm
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pairCode, setPairCode] = useState("");   // shown while waiting, and on the browser's confirm screen
  const [handedOff, setHandedOff] = useState(false); // this browser finished a sign-in that the app started
  const [invite, setInviteState] = useState(() => normalizeInvite(getInvite()));
  const started = useRef(false);

  // Discord sent us back with ?code&state: ask the server to verify and sign in.
  const finish = useCallback(async (confirmed) => {
    setFinishing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("discordLogin", {
        code, state, nonce: getLoginNonce(), confirm: confirmed === true
      });
      const data = res.data || {};
      if (data.invite_url) {
        setInvite(data.invite_url);
        setInviteState(normalizeInvite(data.invite_url));
      }
      if (data.token) {
        setSessionToken(data.token);
        clearLoginNonce();
        if (data.handoff) {
          // The sign-in was started in the app. Tell the person to go back there; the app
          // is picking up its own session right now.
          setHandedOff(true);
          setConfirm(null);
          setFinishing(false);
          return;
        }
        // Full reload so the whole app starts fresh as the signed-in member.
        window.location.replace("/dashboard");
        return;
      }
      if (data.confirm_needed) {
        setConfirm({ name: data.name || "this Discord account", avatar: data.avatar || "", code: data.pair_code || "" });
        setFinishing(false);
        return;
      }
      setConfirm(null);
      setFinishing(false);
      navigate("/login?error=" + encodeURIComponent(data.error || "server"), { replace: true });
    } catch (e) {
      setConfirm(null);
      setFinishing(false);
      setError(errorText(e, "Couldn't finish linking. Try again."));
      navigate("/login", { replace: true });
    }
  }, [code, state, navigate]);

  useEffect(() => {
    if (!code || !state || started.current) return;
    started.current = true;
    finish(false);
  }, [code, state, finish]);

  // ----- Waiting for Discord in the phone app -----
  // On Android the app can't always get Discord's answer back: Discord opens the phone's
  // browser instead and the sign-in finishes there, leaving the app on "Opening Discord".
  // So while the app waits it keeps asking the server whether its own sign-in was finished
  // somewhere else, and picks its session up when it was. It also notices if the session
  // simply appeared on this device (the browser and the app sharing storage).
  const waitingSince = useRef(0);
  const pickup = useCallback(async () => {
    if (getSessionToken()) { window.location.replace("/dashboard"); return true; }
    const nonce = getLoginNonce();
    if (!nonce) return false;
    try {
      const res = await base44.functions.invoke("discordLogin", { action: "pickup", nonce });
      const data = res.data || {};
      if (data.token) {
        setSessionToken(data.token);
        clearLoginNonce();
        window.location.replace("/dashboard");
        return true;
      }
      if (data.error && data.error !== "state") {
        if (data.invite_url) { setInvite(data.invite_url); setInviteState(normalizeInvite(data.invite_url)); }
        clearLoginNonce();
        setBusy(false);
        navigate("/login?error=" + encodeURIComponent(data.error), { replace: true });
        return true;
      }
    } catch { /* asked again in a moment */ }
    return false;
  }, [navigate]);

  useEffect(() => {
    if (code || !busy) return undefined;
    let stop = false;
    if (!waitingSince.current) waitingSince.current = Date.now();
    const tick = async () => {
      if (stop) return;
      if (Date.now() - waitingSince.current > 6 * 60000) {
        setBusy(false);
        waitingSince.current = 0;
        setError("That took too long. Tap Link Discord to try again.");
        return;
      }
      if (await pickup()) stop = true;
    };
    const timer = setInterval(tick, 2500);
    const onBack = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => { stop = true; clearInterval(timer); document.removeEventListener("visibilitychange", onBack); window.removeEventListener("focus", onBack); };
  }, [busy, code, pickup]);

  // The app was closed and reopened while a sign-in was under way: finish it if it is ready.
  useEffect(() => { if (!code && getLoginNonce() && !getSessionToken()) pickup(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The 4-digit code for this sign-in, the same one the browser's confirm screen shows.
  const showCode = async (nonce) => {
    try {
      const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
      const hex = Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
      setPairCode(String(parseInt(hex.slice(0, 8), 16) % 10000).padStart(4, "0"));
    } catch { setPairCode(""); }
  };

  // Already signed in on this device.
  if (!code && !problem && !handedOff && getSessionToken()) return <Navigate to="/dashboard" replace />;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const nonce = newLoginNonce();
      showCode(nonce);
      waitingSince.current = Date.now();
      const res = await base44.functions.invoke("discordAuthStart", { nonce });
      const data = res.data || {};
      if (data.invite_url) setInvite(data.invite_url);
      if (data.url) {
        // Discord refuses to load inside a frame, so always leave at the top level.
        window.top.location.href = data.url;
      } else {
        setError("Couldn't start Discord linking. Try again.");
        setBusy(false);
      }
    } catch (e) {
      setError(errorText(e, "Couldn't start Discord linking."));
      setBusy(false);
    }
  };

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

  if (finishing) {
    return (
      <AuthLayout title="INTROBOYS MEMBERS ONLY" compactTitle>
        <LanternSpinner label="Checking your Discord" className="py-10" />
      </AuthLayout>
    );
  }

  // This browser finished a sign-in that the app started.
  if (handedOff) {
    return (
      <AuthLayout title="INTROBOYS MEMBERS ONLY" compactTitle>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-jade/20 text-jade"><Check className="h-6 w-6" /></span>
          <p className="mt-3 font-heading text-lg font-bold text-gold">You're signed in</p>
          <p className="mt-1 text-sm text-mist">Go back to the BLACKLIST INTROBOYS app. It is signing you in now and will open by itself in a few seconds.</p>
        </div>
        <button onClick={() => window.location.replace("/dashboard")} className="btn-bronze mt-5 h-11 w-full text-sm">
          Use the website in this browser instead
        </button>
      </AuthLayout>
    );
  }

  // Discord came back to a different browser/app than the one that started.
  if (confirm) {
    return (
      <AuthLayout title="INTROBOYS MEMBERS ONLY" compactTitle>
        <div className="flex flex-col items-center text-center">
          {confirm.avatar && <img src={confirm.avatar} alt="" className="h-16 w-16 rounded-full border border-bronze/60" />}
          <p className="mt-3 font-heading text-lg font-bold text-gold">Link Discord as {confirm.name}?</p>
          <p className="mt-1 text-sm text-mist">Only continue if this is your Discord account and you started this yourself.</p>
          {confirm.code && (
            <div className="mt-3 w-full rounded-md border border-bronze/60 bg-panel p-3">
              <p className="text-xs text-mist">If you started this in the app, it shows this same code:</p>
              <p className="mt-1 font-heading text-3xl font-extrabold tracking-[0.3em] text-white">{confirm.code}</p>
              <p className="mt-1 text-xs text-mist">Pressing Yes also signs in that app. If someone sent you this link, or no screen of yours shows this code, press Cancel.</p>
            </div>
          )}
        </div>
        <button onClick={() => finish(true)} className="btn-seal mt-5 h-12 w-full text-base">
          Yes, link my Discord
        </button>
        <button onClick={() => { setConfirm(null); navigate("/login", { replace: true }); }} className="btn-bronze mt-3 h-11 w-full text-sm">
          Cancel
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="INTROBOYS MEMBERS ONLY"
      compactTitle
      subtitle={problem ? undefined : "Link your Discord account to verify you're a member and gain access to the website and events."}
    >
      {problem && (
        <div role="status" className="mb-5 w-full rounded-md border border-bronze/60 bg-panel p-4 text-left">
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
      )}

      {error && <p role="alert" className="mb-4 rounded-md border border-ember/40 bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      <button type="button" onClick={start} disabled={busy} className="btn-seal h-12 w-full text-base">
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Discord</>
          : (problem ? "Link Discord again" : "Link Discord")}
      </button>

      {busy && (
        <div className="mt-3 rounded-md border border-bronze/60 bg-panel p-3 text-center">
          <p className="text-sm text-mist">Finish in Discord, then come back here. If Discord opens your browser instead, press Yes there and return to this app: it will sign you in by itself.</p>
          {pairCode && <p className="mt-2 text-xs text-mist">Your code <span className="ml-1 font-heading text-xl font-extrabold tracking-[0.25em] text-white">{pairCode}</span></p>}
          <button type="button" onClick={() => { setBusy(false); waitingSince.current = 0; }} className="mt-2 text-xs text-mist underline hover:text-white">Cancel and start again</button>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-mist/80">
        Guild members only. We only see your name, avatar, which servers you're in and your roles in our server. We can't read your messages.
      </p>
    </AuthLayout>
  );
}