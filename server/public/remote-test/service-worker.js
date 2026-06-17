/* TiSLY Remote Test PWA — scoped Web Push (iOS 16.4+ standalone) */
const SW_VERSION = "tisly-remote-test-v1";
const OFFLINE_CACHE = "tisly-remote-test-shell-v1";
const ICON_V = "?v=2003";
const SHELL_URLS = [
  "/remote-test",
  "/remote-test/app.js",
  "/remote-test/manifest.webmanifest",
  `/icons/icon-128.png${ICON_V}`,
  `/icons/icon-192.png${ICON_V}`,
  `/icons/icon-512.png${ICON_V}`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  if (!url.pathname.startsWith("/remote-test")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(OFFLINE_CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match("/remote-test"));
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "TiSLY", body: "", url: "/remote-test" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() ?? "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `/icons/icon-192.png${ICON_V}`,
      badge: `/icons/icon-192.png${ICON_V}`,
      data: { url: data.url ?? "/remote-test" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/remote-test";
  event.waitUntil(clients.openWindow(url));
});
