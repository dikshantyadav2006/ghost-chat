const CACHE_NAME = "ghostchat-v2";
const APP_SHELL = ["/", "/start", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // The signaling server and push API are cross-origin and must never be
  // intercepted. This worker only caches the same-origin app shell.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached shell when offline so
  // the app still opens and can restore its session from IndexedDB.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const shell = await cache.match(request);
          return shell || (await cache.match("/start")) || (await cache.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed, immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) await cache.put(request, res.clone());
        return res;
      })(),
    );
  }
});
