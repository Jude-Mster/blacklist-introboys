import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const GuildContext = createContext(null);

// Pull the server's error text out of an SDK error.
export function errorText(e, fallback = "Something went wrong. Try again.") {
  const data = e && e.response && e.response.data;
  if (data && data.error) return data.error;
  return (e && e.message) || fallback;
}

export function GuildProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAccount = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("getMyAccount");
      setAccount(res.data);
      setError(null);
    } catch (e) {
      setError(errorText(e, "Couldn't load your account."));
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await base44.entities.Settings.filter({}, { limit: 1 });
      const items = Array.isArray(res) ? res : res.items;
      setSettings((items && items[0]) || null);
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadAccount(), loadSettings()]);
      setLoading(false);
    })();
  }, [loadAccount, loadSettings]);

  const reload = useCallback(async () => {
    await loadAccount();
  }, [loadAccount]);

  // Show a new balance right away (e.g. after a game) without waiting for a reload.
  const setBalance = useCallback((points) => {
    setAccount((a) => (a && a.member ? { ...a, member: { ...a.member, points } } : a));
  }, []);

  const value = { account, settings, loading, error, reload, loadSettings, setBalance };
  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within GuildProvider");
  return ctx;
}