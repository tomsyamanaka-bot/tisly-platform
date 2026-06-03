/* TiSLY Installer PWA — offline sync + push (Phase 381–400) */
const SW_VERSION = "tisly-installer-v381";
const OFFLINE_CACHE = "tisly-installer-shell-v1";
const SHELL_URLS = [
  "/installer-mode.html",
  "/css/installer-mode.css",
  "/js/installer-mode.js",
  "/js/installer-i18n.js",
  "/js/api.js",
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
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.ok && SHELL_URLS.some((p) => url.pathname.endsWith(p.replace(/^\//, "")) || url.pathname === p)) {
            const clone = res.clone();
            caches.open(OFFLINE_CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match("/installer-mode.html"));
    })
  );
});

/** Background Sync placeholder — notifies open clients to flush queue */
self.addEventListener("sync", (event) => {
  if (event.tag === "tisly-installer-sync") {
    event.waitUntil(notifyClientsFlush());
  }
});

async function notifyClientsFlush() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_OFFLINE_QUEUE", version: SW_VERSION });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "REGISTER_SYNC") {
    if ("sync" in self.registration) {
      self.registration.sync.register("tisly-installer-sync").catch(() => {});
    }
    event.ports?.[0]?.postMessage?.({ ok: true, version: SW_VERSION });
  }
  if (event.data?.type === "QUEUE_UPDATED") {
    event.waitUntil?.(notifyClientsFlush());
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "TiSLY", body: "", url: "/notifications" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() ?? "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/notifications";
  event.waitUntil(clients.openWindow(url));
});
