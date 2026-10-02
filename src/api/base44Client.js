import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { getSessionToken } from '@/lib/session';

const { appId, functionsVersion, appBaseUrl } = appParams;

// Members sign in with Discord, not with a Base44 account. Drop any Base44
// login token left on this device from the old login so it isn't sent along
// (an expired one could make calls fail before they reach our functions).
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('base44_access_token');
    window.localStorage.removeItem('token');
  } catch { /* storage unavailable */ }
}

const client = createClient({
  appId,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});

// Every backend call carries this device's guild session token as `_s`.
// The backend (shared/session.ts) uses it to work out who is calling.
// (Built with Object.create rather than a spread: the SDK client has getters
// that throw when read, so it must not be copied property by property.)
const functions = Object.create(client.functions);
functions.invoke = (name, data) => {
  const token = getSessionToken();
  const payload = { ...(data || {}) };
  if (token) payload._s = token;
  return client.functions.invoke(name, payload);
};

export const base44 = Object.create(client);
Object.defineProperty(base44, 'functions', { value: functions, enumerable: true });