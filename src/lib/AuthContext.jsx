import React, { createContext, useState, useContext, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getSessionToken, clearSession } from '@/lib/session';

// Signed in = this device holds a guild session token (issued after Discord
// confirmed guild membership). The server checks the token on every call; if it
// is no longer valid, GuildContext signs the device out.

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getSessionToken());

  const logout = useCallback(async (shouldRedirect = true) => {
    try { await base44.functions.invoke('sessionLogout'); } catch { /* sign out locally anyway */ }
    clearSession();
    setIsAuthenticated(false);
    if (shouldRedirect) window.location.replace('/');
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.assign('/login');
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsAuthenticated(!!getSessionToken());
  }, []);

  return (
    <AuthContext.Provider value={{
      user: null,
      isAuthenticated,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      authChecked: true,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState: checkUserAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};