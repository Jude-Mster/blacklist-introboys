// The guild's own sign-in. After Discord confirms someone is a member, the
// server gives this device a random token. It lives in localStorage and is sent
// with every backend call (see src/api/base44Client.js).

const TOKEN_KEY = "bi.session";
const NONCE_KEY = "bi.oauth.nonce";
const INVITE_KEY = "bi.invite";

function read(store, key) {
  try { return store.getItem(key) || ""; } catch { return ""; }
}
function write(store, key, value) {
  try { if (value) store.setItem(key, value); else store.removeItem(key); } catch { /* storage unavailable */ }
}

export const getSessionToken = () => (typeof window === "undefined" ? "" : read(window.localStorage, TOKEN_KEY));
export const setSessionToken = (token) => write(window.localStorage, TOKEN_KEY, token);
export const clearSession = () => write(window.localStorage, TOKEN_KEY, "");

// A random value this browser keeps while it is away at Discord, so the server
// can tell whether the same browser came back.
export function newLoginNonce() {
  const a = new Uint8Array(24);
  window.crypto.getRandomValues(a);
  const nonce = Array.from(a).map((x) => x.toString(16).padStart(2, "0")).join("");
  write(window.localStorage, NONCE_KEY, nonce);
  return nonce;
}
export const getLoginNonce = () => read(window.localStorage, NONCE_KEY);
export const clearLoginNonce = () => write(window.localStorage, NONCE_KEY, "");

// The Discord invite link, remembered so the "Members only" card can show it.
export const getInvite = () => read(window.sessionStorage, INVITE_KEY);
export const setInvite = (url) => { if (url) write(window.sessionStorage, INVITE_KEY, url); };