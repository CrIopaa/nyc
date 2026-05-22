/* Service worker for the New York trip guide.
 *
 * Strategy:
 *   - Precache the app shell on install (html, css, js, data, icons, manifest).
 *   - Cache images cache-first (so they work on the plane).
 *   - Cache Google Fonts stale-while-revalidate.
 *   - The page can ask us to precache a list of image URLs after data loads
 *     (so adding items to data.js auto-warms the cache on next visit).
 */

const VERSION = "v2";
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

  if (isImage(req)) {
    event.respondWith(cacheFirst(IMAGE_CACHE, req));
    return;
  }
  if (isFont(req)) {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, req));
    return;
  }

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
