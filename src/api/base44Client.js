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
// ---- Keeping the number of backend calls down ----
// Base44 limits how many calls an app can make. Pages here refresh themselves on a
// timer, so those background refreshes ("reads") are throttled in one place:
//   - a tab that isn't being looked at stops refreshing (it reuses the last answer),
//   - identical refreshes made close together share one call,
//   - after a "rate limit" answer, refreshes pause for a few seconds.
// Anything a member does (bet, play a card, send a message) is never held back.
const READ_FUNCTIONS = { getChatMessages: 3000, getGameFeed: 3000, getLeaderboard: 3000 };
const READ_ACTIONS = { state: 900, list: 900 };
const BACKOFF_MS = 8000;
const lastGood = new Map(); // key -> { at, promise }
let backoffUntil = 0;

const isRateLimit = (e) => {
  const status = (e && (e.status || (e.response && e.response.status))) || 0;
  const data = (e && e.data) || (e && e.response && e.response.data);
  const text = `${(data && data.error) || ""} ${(e && e.message) || ""}`;
  return status === 429 || /rate limit/i.test(text);
};
const busyError = (e) => {
  const message = "The server is busy right now. Give it a few seconds and try again.";
  const status = (e && (e.status || (e.response && e.response.status))) || 429;
  return Object.assign(new Error(message), { status, data: { error: message }, response: { status, data: { error: message } }, rateLimited: true });
};

const functions = Object.create(client.functions);
functions.invoke = (name, data) => {
  const token = getSessionToken();
  const payload = { ...(data || {}) };
  if (token) payload._s = token;

  const ttl = READ_FUNCTIONS[name] ?? (payload.action && !payload.first ? READ_ACTIONS[payload.action] : undefined);
  const call = () => client.functions.invoke(name, payload).catch((e) => {
    if (!isRateLimit(e)) throw e;
    backoffUntil = Date.now() + BACKOFF_MS;
    throw busyError(e);
  });

  if (ttl === undefined) {
    // A member did something: the remembered answers for this function are out of date.
    for (const k of lastGood.keys()) if (k.startsWith(name + "|")) lastGood.delete(k);
    return call();
  }

  const key = `${name}|${JSON.stringify(data || {})}`;
  const hit = lastGood.get(key);
  const now = Date.now();
  const hidden = typeof document !== "undefined" && document.hidden;
  if (hit && (now - hit.at < ttl || hidden || now < backoffUntil)) return hit.promise;
  const promise = call();
  lastGood.set(key, { at: now, promise });
  promise.catch(() => { if (lastGood.get(key) && lastGood.get(key).promise === promise) lastGood.delete(key); });
  return promise;
};

export const base44 = Object.create(client);
Object.defineProperty(base44, 'functions', { value: functions, enumerable: true });