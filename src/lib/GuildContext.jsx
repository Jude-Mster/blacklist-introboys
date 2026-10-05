import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
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

export function GuildProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAccount = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("getMyAccount");
      const data = res.data || {};
      if (!data.linked) {
        // No longer a guild member (lost the role or left the server).
        setInvite(data.invite_url);
        signOutTo("/login?error=no_role");
        return;
      }
      // Don't let a refresh reveal a result that is still being played out on screen.
      setAccount((prev) => (balanceHold.active && prev && prev.member && data.member ? { ...data, member: { ...data.member, points: prev.member.points } } : data));
      if (data.settings) setSettings(data.settings);
      setError(null);
    } catch (e) {
      if (statusOf(e) === 401) {
        signOutTo("/login");
        return;
      }
      setError(errorText(e, "Couldn't load your account."));
    }
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

  // Show a new balance right away (e.g. after a game) without waiting for a reload.
  const setBalance = useCallback((points) => {
    setAccount((a) => (a && a.member ? { ...a, member: { ...a.member, points } } : a));
  }, []);

  // Keep the points in the top bar live: take a balance the moment any answer carries
  // one, look again shortly after something changed, and whenever the member comes back
  // to the tab.
  useEffect(() => {
    let timer = null;
    const onBalance = (e) => { if (e.detail && typeof e.detail.points === "number") setBalance(e.detail.points); };
    const soon = () => { clearTimeout(timer); timer = setTimeout(loadAccount, 2500); };
    const onVisible = () => { if (!document.hidden) soon(); };
    // Points can also change with nothing happening on this page (an officer's award,
    // another player's move), so take a fresh look once a minute while the tab is open.
    const beat = setInterval(() => { if (!document.hidden) loadAccount(); }, 60000);
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
  const value = { account, settings, loading, error, reload, loadSettings: reload, setBalance };
  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within GuildProvider");
  return ctx;
}