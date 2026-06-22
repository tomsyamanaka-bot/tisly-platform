/* TiSLY Multi PWA — Phase 2161 customer portal shell + TiSLY blue logo icon */
const SW_VERSION = "tisly-pwa-v2390-production";
const OFFLINE_CACHE = "tisly-pwa-shell-v2390-production";
const PRIORITY_CACHE = "tisly-pwa-priority-v2390-production";
const ICON_V = "?v=2003";
const SHELL_URLS = [
  "/customer-portal.html",
  "/js/customer-portal.js",
  "/css/customer-portal.css",
  "/customer/new",
  "/customer-new.html",
  "/onboarding/new",
  "/onboarding-new.html",
  "/js/onboarding-wizard.js",
  "/site/new",
  "/site-new.html",
  "/device/provision",
  "/device-provision.html",
  "/deployment/checklist",
  "/deployment-checklist.html",
  "/customer-deploy.html",
  "/js/customer-wizard.js",
  "/js/site-wizard.js",
  "/js/device-provision.js",
  "/js/deployment-checklist.js",
  "/js/customer-deploy.js",
  "/sales",
  "/sales.html",
  "/sales/checklist",
  "/sales-checklist.html",
  "/sales/floor-preview",
  "/sales-floor-preview.html",
  "/devices",
  "/devices.html",
  "/tv/TOMS001",
  "/tv-dashboard.html",
  "/tv-preview.html",
  "/js/sales-demo.js",
  "/js/sales-checklist.js",
  "/js/sales-realtime.js",
  "/js/sales-i18n.js",
  "/js/sales-floor-preview.js",
  "/js/devices.js",
  "/js/tv-dashboard.js",
  "/js/i18n/sales-en.json",
  "/css/tv-dashboard.css",
  "/app-hub.html",
  "/project-dashboard.html",
  "/business-kpi.html",
  "/customer-master.html",
  "/installer-mode.html",
  "/installer-home.html",
  "/install-guide.html",
  "/offline-fallback.html",
  "/survey.html",
  "/maintenance.html",
  "/pro-remote.html",
  "/customer-overview.html",
  "/css/installer-mode.css",
  "/css/installer-home.css",
  "/css/install-guide.css",
  "/css/survey.css",
  "/css/maintenance.css",
  "/css/app-hub.css",
  "/css/tisly-friendly-ui.css",
  "/css/tisly-practical-nav.css",
  "/css/tisly-pwa-shell.css",
  "/survey-v1.html",
  "/estimate-v1.html",
  "/survey-drawing-v1.html",
  "/js/survey-v1.js",
  "/js/survey-drawing-v1.js",
  "/js/estimate-v1.js",
  "/css/survey-drawing-v1.css",
  "/route-health.html",
  "/js/route-health.js",
  "/js/tisly-practical-nav.js",
  "/js/customer-auth.js",
  "/manifest-survey-v1.webmanifest",
  "/manifest-estimate-v1.webmanifest",
  "/css/pro-remote-pwa.css",
  "/js/installer-mode.js",
  "/js/installer-home.js",
  "/js/installer-pwa.js",
  "/js/installer-i18n.js",
  "/js/tisly-pwa-shell.js",
  "/js/app-hub.js",
  "/app-push.html",
  "/app-notifications.html",
  "/js/app-push.js",
  "/js/app-notifications.js",
  "/js/push.js",
  "/remote-test",
  "/remote-test/app.js",
  "/remote-test/manifest.webmanifest",
  "/remote-test/service-worker.js",
  "/js/project-dashboard.js",
  "/js/business-kpi.js",
  "/js/customer-master.js",
  "/js/survey.js",
  "/js/maintenance.js",
  "/js/pro-remote-pwa.js",
  "/js/pro-remote-floor-map.js",
  "/css/pro-remote-floor-map.css",
  "/js/api.js",
  `/icons/icon-64.png${ICON_V}`,
  `/icons/icon-128.png${ICON_V}`,
  `/icons/icon-180.png${ICON_V}`,
  `/icons/icon-192.png${ICON_V}`,
  `/icons/icon-256.png${ICON_V}`,
  `/icons/icon-384.png${ICON_V}`,
  `/icons/icon-512.png${ICON_V}`,
  `/apple-touch-icon.png`,
  "/manifest-installer.webmanifest",
  "/manifest-survey.webmanifest",
  "/manifest-maintenance.webmanifest",
  "/manifest-pro-remote.webmanifest",
  "/manifest-customer.webmanifest",
];

const PRIORITY_URLS = ["/app-hub.html", "/offline-fallback.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PRIORITY_CACHE).then((c) => c.addAll(PRIORITY_URLS).catch(() => {})),
      caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
    ])
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== OFFLINE_CACHE && k !== PRIORITY_CACHE)
          .map((k) => caches.delete(k))
      )
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
  const isHubOrProject =
    url.pathname.startsWith("/app") ||
    url.pathname.startsWith("/project/") ||
    url.pathname === "/business/kpi";
  event.respondWith(
    (isHubOrProject ? caches.match(event.request, { cacheName: PRIORITY_CACHE }) : null).then(
      (priority) => priority || caches.match(event.request)
    ).then((cached) => {
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
  let data = { title: "TiSLY", body: "", url: "/app/notifications" };
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
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/app/notifications";
  event.waitUntil(clients.openWindow(url));
});
