import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { clearSession, setInvite } from "@/lib/session";
import { balanceHold } from "@/lib/balanceHold";

const GuildContext = createContext(null);

// Pull the server's error text out of an SDK error.
export function errorText(e, fallback = "Something went wrong. Try again.") {
  const data = (e && e.data) || (e && e.response && e.response.data);
  if (data && typeof data.error === "string") return data.error;
  return (e && e.message) || fallback;
}

const statusOf = (e) => (e && (e.status || (e.response && e.response.status))) || 0;

// This device's session is no longer good: forget it and go back to the login page.
function signOutTo(path) {
  clearSession();
  window.location.replace(path);
}

// 6.15: the account is read less often and lighter. The plain read is member + settings only;
// history, stats and rank ride along only while a page that shows them is open (useAccountDetail).
// Reloads that aren't forced wait until at least MIN_GAP has passed since the last one.
const MIN_GAP = 10000;
const HEARTBEAT = 90000;
const DETAIL_KEYS = ["rank", "stats", "recentLogs", "recentBets"];

export function GuildProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const wantDetail = useRef(0);
  const lastAt = useRef(0);
  const inFlight = useRef(null);

  const loadAccount = useCallback(async (opts = {}) => {
    const detail = opts.detail === true || wantDetail.current > 0;
    if (inFlight.current && !opts.fresh && !(detail && !inFlight.current.detail)) return inFlight.current.p;
    const run = (async () => {
      lastAt.current = Date.now();
      try {
        const res = await base44.functions.invoke("getMyAccount", { detail, fresh: opts.fresh === true });
        const data = res.data || {};
        if (!data.linked) {
          // No longer a guild member (lost the role or left the server).
          setInvite(data.invite_url);
          signOutTo("/login?error=no_role");
          return;
        }
        setAccount((prev) => {
          // A light read keeps the history the last detailed read brought.
          const kept = !data.detail && prev ? Object.fromEntries(DETAIL_KEYS.filter((k) => k in prev).map((k) => [k, prev[k]])) : {};
          const next = { ...kept, ...data };
          // Don't let a refresh reveal a result that is still being played out on screen.
          return balanceHold.active && prev && prev.member && data.member ? { ...next, member: { ...data.member, points: prev.member.points } } : next;
        });
        if (data.settings) setSettings(data.settings);
        setError(null);
      } catch (e) {
        if (statusOf(e) === 401) {
          signOutTo("/login");
          return;
        }
        setError(errorText(e, "Couldn't load your account."));
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = { p: run, detail };
    return run;
  }, []);

  useEffect(() => {
    (async () => {
      await loadAccount();
      setLoading(false);
    })();
  }, [loadAccount]);

  const reload = useCallback(async () => {
    await loadAccount();
  }, [loadAccount]);
  // After the leader saves settings: skip the server's short settings cache.
  const loadSettings = useCallback(async () => {
    await loadAccount({ fresh: true });
  }, [loadAccount]);
  const loadDetail = useCallback(async () => {
    await loadAccount({ detail: true });
  }, [loadAccount]);

  // Show a new balance right away (e.g. after a game) without waiting for a reload.
  const setBalance = useCallback((points) => {
    setAccount((a) => (a && a.member ? { ...a, member: { ...a.member, points } } : a));
  }, []);

  // Keep the points in the top bar live: take a balance the moment any answer carries
  // one, look again a little after something changed (never more than once per MIN_GAP),
  // and whenever the member comes back to the tab.
  useEffect(() => {
    let timer = null;
    const onBalance = (e) => { if (e.detail && typeof e.detail.points === "number") setBalance(e.detail.points); };
    const soon = () => {
      clearTimeout(timer);
      const wait = Math.max(2500, MIN_GAP - (Date.now() - lastAt.current));
      timer = setTimeout(() => loadAccount(), wait);
    };
    const onVisible = () => { if (!document.hidden) soon(); };
    // Points can also change with nothing happening on this page (an officer's award,
    // another player's move), so take a fresh look now and then while the tab is open.
    const beat = setInterval(() => {
      if (!document.hidden && Date.now() - lastAt.current >= HEARTBEAT - 1000) loadAccount();
    }, HEARTBEAT);
    window.addEventListener("bi:balance", onBalance);
    window.addEventListener("bi:changed", soon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(beat);
      window.removeEventListener("bi:balance", onBalance);
      window.removeEventListener("bi:changed", soon);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadAccount, setBalance]);

  // Settings arrive with the account, so reloading the account refreshes both.
  const value = { account, settings, loading, error, reload, loadSettings, loadDetail, setBalance, wantDetail };
  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

// Pages that show history, stats or rank call this: it fetches them now and keeps them
// coming with each refresh while the page is open.
export function useAccountDetail() {
  const ctx = useContext(GuildContext);
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.wantDetail.current += 1;
    ctx.loadDetail();
    return () => { ctx.wantDetail.current -= 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within GuildProvider");
  return ctx;
}