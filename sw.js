/* Service worker for the New York trip guide.
 *
 * Strategy:
 *   - Precache the app shell on install (html, css, js, data, icons, manifest).
 *   - Cache images cache-first (so they work on the plane).
 *   - Cache Google Fonts stale-while-revalidate.
 *   - The page can ask us to precache a list of image URLs after data loads
 *     (so adding items to data.js auto-warms the cache on next visit).
 */

const VERSION = "v4";
const SHELL_CACHE = `ny-shell-${VERSION}`;
const IMAGE_CACHE = `ny-images-${VERSION}`;
const FONT_CACHE = `ny-fonts-${VERSION}`;

const SHELL_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./manifest.json",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(SHELL_URLS.map((u) => cache.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, IMAGE_CACHE, FONT_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isImage(req) {
  if (req.destination === "image") return true;
  const url = new URL(req.url);
  return /\.(?:jpg|jpeg|png|webp|avif|gif|svg)$/i.test(url.pathname);
}
function isFont(req) {
  const url = new URL(req.url);
  return (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    req.destination === "font"
  );
}

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetching = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetching;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigation requests (PWA cold-start, full page reload). iOS standalone
  // PWAs sometimes launch with extra query/hash, so ignoreSearch matches
  // the cached index.html even when the launch URL differs slightly.
  if (req.mode === "navigate" ||
      (req.destination === "document") ||
      (req.headers.get("Accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      // Try network first so we get fresh content when online.
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (_) {
        // Offline: try direct match, then ignoreSearch, then index.html.
        const cache = await caches.open(SHELL_CACHE);
        const direct = await cache.match(req);
        if (direct) return direct;
        const looseSearch = await cache.match(req, { ignoreSearch: true });
        if (looseSearch) return looseSearch;
        const indexExact = await cache.match("./index.html");
        if (indexExact) return indexExact;
        const indexLoose = await cache.match("./");
        if (indexLoose) return indexLoose;
        // Last-ditch: build a minimal HTML response.
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Offline</title>" +
          "<style>body{font-family:sans-serif;color:#2b2b2b;background:#ecebe8;display:grid;place-items:center;min-height:100dvh;margin:0;padding:24px;text-align:center}</style>" +
          "<p>You're offline and the app hasn't been cached yet. Connect to wifi and load the page once to enable offline mode.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  if (isImage(req)) {
    event.respondWith(cacheFirst(IMAGE_CACHE, req));
    return;
  }
  if (isFont(req)) {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, req));
    return;
  }

  // Other same-origin GETs: cache-first.
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              if (res && res.status === 200) {
                caches.open(SHELL_CACHE).then((c) => c.put(req, res.clone()));
              }
              return res;
            })
            .catch(() => caches.match("./index.html"))
      )
    );
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "precache-images" && Array.isArray(msg.urls)) {
    event.waitUntil(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        for (const u of msg.urls) {
          try {
            const hit = await cache.match(u);
            if (hit) continue;
            const res = await fetch(u, { cache: "no-cache" });
            if (res && res.status === 200) await cache.put(u, res.clone());
          } catch (_) {
            /* ignore individual failures */
          }
        }
      })
    );
  }
});
