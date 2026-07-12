/* TiSLY Multi PWA — Phase28 現場PWA爆速化
 * 図面エディタ / 音声ナビ含む
 * フィールドオペ用アセットを優先キャッシュ */
/* AI解析1500px送信ルール強制適用 */
const SW_VERSION = "tisly-pwa-v2414-phase46";
const OFFLINE_CACHE = "tisly-pwa-shell-v2414-phase46";
const PRIORITY_CACHE = "tisly-pwa-priority-v2414-phase46";
const FIELD_OPS_CACHE = "tisly-pwa-fieldops-v2414-phase46";
const ICON_V = "?v=2004";

/** 図面エディタ v1 — ES module 群 */
const DRAWING_EDITOR_URLS = [
  "/js/features/drawing/drawing-editor-v1.js",
  "/js/features/drawing/drawing-editor-canvas-v1.js",
  "/js/features/drawing/drawing-symbol-palette-v1.js",
  "/js/features/drawing/drawing-field-innovations-v1.js",
  "/js/features/drawing/survey-sketch-auto-draw-v1.js",
  "/css/features/drawing/drawing-editor-v1.css",
];

/** 音声ナビ v1 — 静的アセット */
const VOICE_NAV_URLS = [
  "/voice-nav-v1.html",
  "/js/features/voice-nav/voice-nav-v1.js",
  "/js/features/voice-nav/voice-nav-ui-v1.js",
  "/js/features/voice-nav/voice-nav-state-v1.js",
  "/js/features/voice-nav/voice-nav-sequence-v1.js",
  "/js/features/voice-nav/voice-nav-speech-v1.js",
  "/js/features/voice-nav/voice-nav-offline-v1.js",
  "/css/features/voice-nav/voice-nav-v1.css",
];

/** 現場ナビ・オフライン連携 */
const FIELD_OPS_SUPPORT_URLS = [
  "/js/offline-resilience-v1.js",
  "/js/tisly-navigation-stack-v1.js",
  "/js/tisly-navigation-stack-shared-v1.js",
  "/js/tisly-return-nav-v1.js",
  "/js/survey-pdf-actions-v1.js",
  "/js/pdf-share-v1.js",
  "/master-v1.html",
  "/js/master-v1.js",
];

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
  "/document-viewer-v1.html",
  "/documents-v1.html",
  "/project-mgmt-detail-v1.html",
  "/project-dashboard-v1.html",
  "/js/document-viewer-v1.js",
  "/css/document-viewer-v1.css",
  "/js/tisly-sw-refresh-v1.js",
  "/js/survey-v1.js",
  "/js/survey-pdf-actions-v1.js",
  "/js/survey-drawing-v1.js",
  "/js/estimate-v1.js",
  "/css/survey-drawing-v1.css",
  "/route-health.html",
  "/js/route-health.js",
  "/customer-v1.html",
  "/customer-home-v1.html",
  "/customer-project-v1.html",
  "/customer-document-v1.html",
  "/customer-monitoring-v1.html",
  "/js/customer-v1.js",
  "/js/customer-home-v1.js",
  "/js/customer-project-v1.js",
  "/js/customer-document-v1.js",
  "/js/customer-monitoring-v1.js",
  "/js/customer-nav-v1.js",
  "/js/customer-shared-v1.js",
  "/js/customer-cache-v1.js",
  "/css/customer-v1.css",
  "/manifest-customer-v1.webmanifest",
  "/js/tisly-practical-nav.js?v=practical-nav-v2",
  "/js/customer-auth.js",
  "/js/tisly-fetch-v1.js",
  "/schedule-v1.html",
  "/projects-v1.html",
  "/field-check-v1.html",
  "/field-checklist-v1.html",
  "/purchase-v1.html",
  "/js/schedule-v1.js",
  "/js/projects-v1.js",
  "/js/field-check-v1.js",
  "/js/field-checklist-v1.js",
  "/js/purchase-v1.js",
  "/js/field-checklist-ui.js?v=fc-ui-v3",
  "/js/field-checklist-defaults-v1.js",
  "/js/survey-drawing-local-v1.js",
  "/css/field-ops-mobile.css",
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
  "/remote-v1",
  "/js/remote-v1.js",
  "/css/remote-v1.css",
  "/knowledge-v1",
  "/js/knowledge-v1.js",
  "/css/knowledge-v1.css",
  "/knowledge-register-v1",
  "/js/knowledge-register-v1.js",
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
  ...DRAWING_EDITOR_URLS,
  ...VOICE_NAV_URLS,
  ...FIELD_OPS_SUPPORT_URLS,
];

const PRIORITY_URLS = ["/app-hub.html", "/offline-fallback.html"];

/** install — 3系統キャッシュを同時プリロード */
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PRIORITY_CACHE).then((c) => c.addAll(PRIORITY_URLS).catch(() => {})),
      caches.open(FIELD_OPS_CACHE).then((c) =>
        c.addAll([...DRAWING_EDITOR_URLS, ...VOICE_NAV_URLS, ...FIELD_OPS_SUPPORT_URLS]).catch(() => {})
      ),
      caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
    ])
  );
  self.skipWaiting();
});

/** activate — 旧世代キャッシュを一括削除 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== OFFLINE_CACHE && k !== PRIORITY_CACHE && k !== FIELD_OPS_CACHE)
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

/** お客様ゾーン — 常にネットワーク優先 */
function isCustomerFreshAsset(pathname) {
  return (
    pathname === "/customer" ||
    pathname.startsWith("/customer/") ||
    pathname.startsWith("/js/customer-") ||
    pathname === "/css/customer-v1.css" ||
    pathname === "/manifest-customer-v1.webmanifest"
  );
}

/** 現場PWA — キャッシュ優先 + 裏で更新
 * 図面 / 音声ナビ / 日程 / 見積 等 */
function isFieldOpsFastAsset(pathname) {
  if (pathname.startsWith("/api/")) return false;
  const prefixes = [
    "/survey-v1",
    "/survey-drawing-v1",
    "/estimate-v1",
    "/schedule-v1",
    "/projects-v1",
    "/field-check",
    "/field-checklist",
    "/purchase-v1",
    "/voice-nav-v1",
    "/document-viewer",
    "/document-center",
    "/documents-v1",
    "/project-dashboard-v1",
    "/project-mgmt-detail-v1",
    "/master-v1",
    "/js/survey-",
    "/js/estimate-",
    "/js/schedule-",
    "/js/projects-",
    "/js/field-",
    "/js/purchase-",
    "/js/features/drawing/",
    "/js/features/voice-nav/",
    "/js/offline-resilience",
    "/js/tisly-navigation",
    "/js/tisly-return-nav",
    "/js/master-v1",
    "/css/survey-",
    "/css/features/drawing/",
    "/css/features/voice-nav/",
    "/css/field-ops",
    "/css/document-viewer",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p));
}

/** アイコン類 — 長期キャッシュファースト */
function isStaticIconAsset(pathname) {
  return (
    pathname.startsWith("/icons/") ||
    pathname === "/apple-touch-icon.png" ||
    pathname.endsWith(".webmanifest")
  );
}

/** stale-while-revalidate — 即返却 + 裏更新 */
async function cacheFirstStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkRefresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    networkRefresh.catch(() => {});
    return cached;
  }

  const fetched = await networkRefresh;
  if (fetched) return fetched;

  const shell =
    (await caches.match("/offline-fallback.html")) ||
    (await caches.match("/installer-mode.html"));
  return shell || new Response("Offline", { status: 503 });
}

/** ネットワーク優先 — 成功時のみキャッシュ更新 */
async function networkFirstWithCache(request) {
  try {
    const res = await fetch(request);
    if (res.ok && isShellPath(new URL(request.url).pathname)) {
      const clone = res.clone();
      caches.open(OFFLINE_CACHE).then((c) => c.put(request, clone));
    }
    return res;
  } catch {
    return (await caches.match(request)) || new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  // blob/dataはSWで触れず
  // ブラウザ側に完全委譲する
  if (
    event.request.url.startsWith("blob:") ||
    event.request.url.startsWith("data:")
  ) {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  if (isCustomerFreshAsset(url.pathname)) {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  if (isFieldOpsFastAsset(url.pathname)) {
    event.respondWith(cacheFirstStaleWhileRevalidate(event.request, FIELD_OPS_CACHE));
    return;
  }

  if (isStaticIconAsset(url.pathname)) {
    event.respondWith(cacheFirstStaleWhileRevalidate(event.request, OFFLINE_CACHE));
    return;
  }

  const isHubOrProject =
    url.pathname.startsWith("/app") ||
    url.pathname.startsWith("/project/") ||
    url.pathname === "/business/kpi";

  event.respondWith(
    (isHubOrProject ? caches.match(event.request, { cacheName: PRIORITY_CACHE }) : null)
      .then((priority) => priority || caches.match(event.request))
      .then((cached) => {
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
