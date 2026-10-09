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
const READ_ACTIONS = { state: 900, list: 900, race: 900 };
const BACKOFF_MS = 4000;
const LOAD_ACTIONS = new Set(["state", "list", "catalog", "adminOverview", "roster", "totals", "search", "discordStatus", "ping", "mine", "pending", "adminList", "stockSummary"]);
const LOAD_RETRY_MS = [1200, 2500, 5000];
// Games that play an animation before the result should be seen set the balance themselves.
const HOLD_BALANCE = new Set(["playGame"]);
// Calls that can't change anyone's points.
const NO_POINTS = new Set(["getMyAccount", "chatSend", "sessionLogout", "discordAuthStart", "discordLogin", "pushAction", "prizeAction"]);
const announce = (type, detail) => {
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch { /* not in a browser */ }
};
const lastGood = new Map(); // key -> { at, promise } of the last answer that worked
// Counts the changes a member has made through each function. A refresh that was asked for
// before a change finished may describe the table as it was BEFORE the change (for example
// without the chips just placed), so it is never remembered and is asked for again.
const changes = new Map();
const bump = (name) => changes.set(name, (changes.get(name) || 0) + 1);
const forget = (name) => {
  for (const k of [...lastGood.keys()]) if (k.startsWith(name + "|")) lastGood.delete(k);
  for (const k of [...inFlight.keys()]) if (k.startsWith(name + "|")) inFlight.delete(k);
};
const inFlight = new Map();
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
  // Loading something (not changing anything) is safe to ask for again, so a busy
  // answer is retried quietly a few times before the member ever sees an error.
  const isLoad = ttl !== undefined || /^(get|list)/i.test(name) || LOAD_ACTIONS.has(payload.action);
  // Any answer that says what the member's balance is now updates the top bar straight
  // away. A change that doesn't say (a table paying out later) asks for a fresh look.
  const once = () => client.functions.invoke(name, payload).then((res) => {
    const d = res && res.data;
    if (HOLD_BALANCE.has(name)) return res;
    if (d && typeof d.balance === "number") announce("bi:balance", { points: d.balance });
    else if (ttl === undefined && !isLoad && !NO_POINTS.has(name) && payload.action !== "react" && payload.action !== "settle") announce("bi:changed", {});
    return res;
  });
  const call = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once();
      } catch (e) {
        if (!isRateLimit(e)) throw e;
        backoffUntil = Date.now() + BACKOFF_MS;
        if (!isLoad || attempt >= LOAD_RETRY_MS.length) throw busyError(e);
        await new Promise((r) => setTimeout(r, LOAD_RETRY_MS[attempt]));
      }
    }
  };

  if (ttl === undefined) {
    // A member did something: the remembered answers for this function are out of date,
    // both now and again once the change has gone through.
    bump(name);
    forget(name);
    return call().finally(() => { bump(name); forget(name); });
  }

  const key = `${name}|${JSON.stringify(data || {})}`;
  const hit = lastGood.get(key);
  const now = Date.now();
  const hidden = typeof document !== "undefined" && document.hidden;
  const resting = hidden || now < backoffUntil;
  // Reuse the last good answer when it is fresh, the tab is hidden, or we were just told to slow down.
  // (Never an answer more than a few seconds old: a table that has moved on must be seen to move on.)
  if (hit && (now - hit.at < ttl || (resting && now - hit.at < 5000))) return hit.promise;
  if (inFlight.has(key)) return inFlight.get(key);
  // If a change went through while this refresh was on its way, its answer may be from
  // before the change: ask once more so the page never steps back in time.
  let clean = true;
  const fresh = async () => {
    for (let again = 0; ; again++) {
      const before = changes.get(name) || 0;
      const res = await call();
      clean = (changes.get(name) || 0) === before;
      if (clean || again >= 1) return res;
    }
  };
  const promise = fresh();
  inFlight.set(key, promise);
  promise
    .then(() => { if (clean && inFlight.get(key) === promise) lastGood.set(key, { at: Date.now(), promise }); })
    .catch(() => {})
    .finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
  return promise;
};

export const base44 = Object.create(client);
Object.defineProperty(base44, 'functions', { value: functions, enumerable: true });