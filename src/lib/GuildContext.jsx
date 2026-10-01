import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const GuildContext = createContext(null);

export function GuildProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAccount = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("getMyAccount");
      setAccount(res.data);
    } catch (e) {
      setError(e.message || "Failed to load account");
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await base44.entities.Settings.filter({}, { limit: 1 });
      setSettings(res.items[0] || null);
    } catch (e) {
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

  const value = { account, settings, loading, error, reload, loadSettings };
  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within GuildProvider");
  return ctx;
}