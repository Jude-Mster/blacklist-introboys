import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { clearSession, setInvite, getSessionToken } from "@/lib/session";
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
  dropCache();
  window.location.replace(path);
}

// 6.16: the last account this device loaded is kept, so a member coming back sees the site at once
// (and keeps seeing it while the server is busy) while a fresh copy loads in the background.
const CACHE_KEY = "bi:account";
const CACHE_MAX_MS = 24 * 60 * 60 * 1000;
const tokenTag = () => { const t = getSessionToken() || ""; return t ? t.slice(-12) : ""; };
function readCache() {
  try {
    const tag = tokenTag();
    const c = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (!c || !tag || c.tag !== tag || Date.now() - (c.at || 0) > CACHE_MAX_MS || !c.data || !c.data.linked) return null;
    return c.data;
  } catch { return null; }
}
function writeCache(data) {
  try {
    const tag = tokenTag();
    if (!tag || !data || !data.linked) return;
    const light = { linked: true, setup: data.setup, member: data.member, settings: data.settings, version: data.version, cached: true };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ tag, at: Date.now(), data: light }));
  } catch { /* storage full or blocked */ }
}
function dropCache() { try { window.localStorage.removeItem(CACHE_KEY); } catch { /* blocked */ } }
// A busy server is retried quietly on the first load before the member is shown an error.
const FIRST_RETRY_MS = [2000, 4000, 8000, 15000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 6.15: the account is read less often and lighter. The plain read is member + settings only;
// history, stats and rank ride along only while a page that shows them is open (useAccountDetail).
// Reloads that aren't forced wait until at least MIN_GAP has passed since the last one.
const MIN_GAP = 10000;
const HEARTBEAT = 90000;
const DETAIL_KEYS = ["rank", "stats", "recentLogs", "recentBets"];

export function GuildProvider({ children }) {
  const [cached] = useState(() => (typeof window === "undefined" ? null : readCache()));
  const [account, setAccount] = useState(cached);
  const [settings, setSettings] = useState(cached ? cached.settings : null);
  const [loading, setLoading] = useState(!cached);
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
        writeCache(data);
        setError(null);
        return true;
      } catch (e) {
        if (statusOf(e) === 401) {
          signOutTo("/login");
          return true;
        }
        setError(errorText(e, "Couldn't load your account."));
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = { p: run, detail };
    return run;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // With a saved copy on screen, one quiet attempt is enough (the heartbeat tries again later).
      let ok = await loadAccount();
      for (let i = 0; !ok && !cached && alive && i < FIRST_RETRY_MS.length; i++) {
        await sleep(FIRST_RETRY_MS[i]);
        if (alive) ok = await loadAccount({ fresh: false });
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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