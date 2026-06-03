/* TiSLY Installer PWA — Phase 441–460 app shell */
const SW_VERSION = "tisly-installer-v441";
const OFFLINE_CACHE = "tisly-installer-shell-v441";
const SHELL_URLS = [
  "/installer-mode.html",
  "/installer-home.html",
  "/install-guide.html",
  "/offline-fallback.html",
  "/survey.html",
  "/css/installer-mode.css",
  "/css/installer-home.css",
  "/css/install-guide.css",
  "/css/survey.css",
  "/js/installer-mode.js",
  "/js/installer-home.js",
  "/js/installer-pwa.js",
  "/js/installer-i18n.js",
  "/js/api.js",
  "/js/survey.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest-installer.webmanifest",
  "/manifest-survey.webmanifest",
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

function isShellPath(pathname) {
  return SHELL_URLS.some(
    (p) => pathname === p || pathname.endsWith(p.replace(/^\//, ""))
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.ok && isShellPath(url.pathname)) {
            const clone = res.clone();
            caches.open(OFFLINE_CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(async () => {
          const fb =
            (await caches.match("/offline-fallback.html")) ||
            (await caches.match("/installer-mode.html"));
          return fb || new Response("Offline", { status: 503 });
        });
    })
  );
});

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
