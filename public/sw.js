// Service worker: makes the app installable and lets the app shell open without a connection.
// Network-first, so a deploy shows up on the next launch; the cache is only a fallback.
// API calls and audio (streamed from dharmaseed.org) are never intercepted.

const CACHE = "app-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./main.js",
  "./api.js",
  "./backup.js",
  "./player.js",
  "./playlist.js",
  "./queue.js",
  "./search.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
        return cached || (request.mode === "navigate" ? caches.match("./") : Response.error());
      })
  );
});
