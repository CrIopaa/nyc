/* KILL-SWITCH service worker — active while we're iterating.
 *
 * On install/activate it deletes every cache and unregisters itself,
 * then reloads any open tabs so the next page load goes straight to
 * the network. Will be restored to the real offline SW right before
 * the flight (flip ENABLE_OFFLINE in app.js to true and put back the
 * caching implementation).
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => {
      try { c.navigate(c.url); } catch (_) {}
    });
  })());
});

self.addEventListener("fetch", () => { /* pass-through, no cache */ });
