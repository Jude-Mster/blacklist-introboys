// 6.24: pages other than the guild hall and the games are downloaded when first needed (the first visit no
// longer downloads every page of the site), and fetched ahead in the background: the live tables shortly
// after the site opens, the 3D games from the Games page, and any page as soon as a finger or pointer lands
// on a link to it.
import React from "react";
// A piece that can't be downloaded is usually one replaced by a newer publish (this tab still runs the old
// page): reload once to pick up the new site. Otherwise wait a moment before the next try (no retry storm).
const RELOAD_KEY = "bi:chunk-reload";
function failed(e) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last > 60000) { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); window.location.reload(); }
  } catch { /* storage blocked */ }
  return new Promise((_, no) => setTimeout(() => no(e), 3000));
}
const once = (f) => {
  let p = null;
  const load = () => (p ||= f().then((m) => { load.mod = m; return m; }).catch((e) => { const w = failed(e); w.catch(() => { p = null; }); return w; }));
  load.mod = null;
  return load;
};
// A component for a page or game that may not be downloaded yet: once it is (fetched ahead), it shows
// straight away, with no loading flash; until then it waits in the nearest <Suspense>.
export function deferred(load) {
  function Deferred(props) {
    if (!load.mod) throw load();
    return React.createElement(load.mod.default, props);
  }
  return Deferred;
}

export const PAGE_LOADERS = {
  poker: once(() => import("@/pages/Poker")),
  pusoy: once(() => import("@/pages/Pusoy")),
  derby: once(() => import("@/pages/Derby")),
  arena: once(() => import("@/pages/Arena")),
  shop: once(() => import("@/pages/Shop")),
  guide: once(() => import("@/pages/Guide")),
  leaderboard: once(() => import("@/pages/Leaderboard")),
  profile: once(() => import("@/pages/Profile")),
  admin: once(() => import("@/pages/Admin")),
  buysell: once(() => import("@/pages/BuySell")),   // 6.25
  market: once(() => import("@/pages/Market"))
};

// the 3D pages are big (the 3D engine): fetched ahead only on a good connection
const HEAVY = new Set(["derby", "arena"]);
const slowLink = () => {
  try { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))); } catch { return false; }
};

export function prefetchPath(href) {
  try {
    const u = new URL(href, window.location.origin);
    if (u.origin !== window.location.origin) return;
    const key = u.pathname.split("/")[1] || "";
    const load = PAGE_LOADERS[key];
    if (!load || (HEAVY.has(key) && slowLink())) return;
    load().catch(() => {});
  } catch { /* not a link we know */ }
}

const idle = (fn, ms) => {
  const run = () => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : fn());
  setTimeout(run, ms);
};
let warmed = false;
// Called once the site is up: the live tables (Poker, Pusoy) come down in the background.
export function warmUp() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  idle(() => { prefetchPath("/poker"); prefetchPath("/pusoy"); }, 2500);
}
// On the Games page: the live 3D games it links to (on a good connection).
export function warmGames() { idle(() => { prefetchPath("/derby"); prefetchPath("/arena"); }, 4000); }
