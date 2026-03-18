/* Basic offline-first cache for the PWA. */
const CACHE_NAME = "zerosbatti-cache-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./vendor/html5-qrcode.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-768.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-167.png",
  "./icons/icon-152.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const isNavigation = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
      if (isNavigation) {
        try {
          const res = await fetch(req);
          // Keep a fresh app shell for offline.
          if (res && res.ok) cache.put("./index.html", res.clone());
          return res;
        } catch {
          const fallback = await cache.match("./index.html", { ignoreSearch: true });
          return fallback || new Response("Offline", { status: 503 });
        }
      }

      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // Cache same-origin and CDN libs after first load, for offline usage.
        if (res && (new URL(req.url).origin === self.location.origin || req.url.includes("cdn.jsdelivr.net"))) {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
