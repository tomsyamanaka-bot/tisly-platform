// TiSLY PLC Builder v5.18 — PWA Export Strengthening
const CACHE = "tisly-pwa-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./manifest.webmanifest",
  "./UI_CONFIG.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match("./index.html").then((r) => r || caches.match("./offline.html"))
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match("./offline.html")))
  );
});
