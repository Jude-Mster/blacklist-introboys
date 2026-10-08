// Service worker for guild event notifications. It caches nothing and does not touch
// page loading. It shows:
//   - push notifications sent by the site (war and HSB alerts), even when the app is closed
//   - notifications the open page asks it to show
const VIBRATE = [300, 120, 300, 120, 500];
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "BLACKLIST INTROBOYS", {
    body: m.body || "",
    tag: m.tag || undefined,
    renotify: true,
    icon: "/notify-icon.png",
    badge: "/notify-badge.png",
    vibrate: VIBRATE,
    requireInteraction: false,
    data: { url: m.url || "/dashboard", kind: m.kind || "" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/dashboard";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { await c.focus(); if ("navigate" in c) await c.navigate(url); return; } catch { /* try the next */ } } }
    return self.clients.openWindow(url);
  })());
});
