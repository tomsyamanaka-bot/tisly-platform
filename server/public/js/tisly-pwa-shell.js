/** TiSLY shared PWA app shell — Phase 461–480 */

export function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById("tisly-pwa-install-strip")?.removeAttribute("hidden");
});

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return outcome === "accepted";
}

function customerCodeFromPath() {
  const m = location.pathname.match(/\/customer\/([^/]+)/i);
  return m ? m[1].toUpperCase() : sessionStorage.getItem("tisly_customer_code") || "TOMS001";
}

function wireInstallStrip() {
  document.getElementById("btn-tisly-pwa-install")?.addEventListener("click", () => {
    promptPwaInstall().catch(() => {});
  });
  const guide = document.getElementById("link-tisly-install-guide");
  if (guide) guide.href = "/install-guide";
  if (isStandalonePwa()) {
    document.getElementById("tisly-pwa-install-strip")?.setAttribute("hidden", "");
  }
}

function wireOnlineStatus() {
  const dot = document.getElementById("tisly-online-dot");
  const text = document.getElementById("tisly-online-text");
  const sync = document.getElementById("tisly-sync-status");
  function update() {
    const on = navigator.onLine;
    if (dot) {
      dot.className = on ? "dot online" : "dot offline";
    }
    if (text) text.textContent = on ? "online" : "offline";
    if (sync) sync.textContent = on ? "同期: 待機" : "同期: オフライン";
  }
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function wireServiceWorkerUpdate() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    const banner = document.getElementById("tisly-pwa-update-banner");
    if (banner) {
      banner.hidden = false;
      banner.querySelector("button")?.addEventListener("click", () => location.reload());
    }
  });
}

export async function loadPwaSwitcher(currentApp) {
  const menu = document.getElementById("tisly-pwa-switcher-menu");
  if (!menu) return;
  const token = sessionStorage.getItem("tisly_token");
  if (!token) {
    menu.innerHTML = `<a href="/app">App Hub（ログイン）</a>`;
    return;
  }
  try {
    const res = await fetch("/api/pwa/hub", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.customerCode) sessionStorage.setItem("tisly_customer_code", data.customerCode);
    const items = [
      { id: "hub", label: "App Hub", url: "/app" },
      ...(data.notifications || []).map((n) => ({
        id: n.id,
        label: n.label,
        url: n.href,
      })),
      ...(data.apps || []),
    ];
    menu.innerHTML = items
      .map((a) => {
        const active = a.id === currentApp ? ' aria-current="page"' : "";
        return `<a href="${a.url}"${active}>${a.label}</a>`;
      })
      .join("");
    const hidden = (data.switcher || [])
      .filter((s) => !s.visible)
      .map((s) => s.id);
    for (const id of hidden) {
      const link = menu.querySelector(`a[href*="${id}"]`);
      /* only catalog entries */
    }
  } catch {
    /* offline */
  }
}

export function wireSwitcherToggle() {
  const btn = document.getElementById("btn-tisly-pwa-switcher");
  const menu = document.getElementById("tisly-pwa-switcher-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", () => {
    const hidden = menu.hasAttribute("hidden");
    if (hidden) menu.removeAttribute("hidden");
    else menu.setAttribute("hidden", "");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tisly-pwa-switcher")) menu.setAttribute("hidden", "");
  });
}

export function renderPwaTopbar(currentApp, title) {
  const root = document.getElementById("tisly-pwa-topbar-root");
  if (!root) return;
  root.innerHTML = `
    <nav class="tisly-pwa-topbar" aria-label="TiSLY PWA">
      <a class="brand-link" href="/app">TiSLY</a>
      <span class="tisly-pwa-title">${title}</span>
      <div class="tisly-pwa-switcher">
        <button type="button" id="btn-tisly-pwa-switcher" aria-haspopup="true">アプリ切替 ▾</button>
        <div id="tisly-pwa-switcher-menu" class="tisly-pwa-switcher-menu" hidden></div>
      </div>
    </nav>
    <div id="tisly-pwa-install-strip" class="tisly-pwa-install-strip" hidden>
      <button type="button" id="btn-tisly-pwa-install">ホーム画面に追加</button>
      <a id="link-tisly-install-guide" href="/install-guide">インストール手順</a>
    </div>
    <div class="tisly-pwa-status-bar" role="status">
      <span id="tisly-online-dot" class="dot online">●</span>
      <span id="tisly-online-text">online</span>
      <span id="tisly-sync-status">同期: —</span>
      <span id="tisly-connection-badges" class="tisly-connection-badges"></span>
      <button type="button" id="btn-hub-sync" class="btn-sync-touch" hidden>同期</button>
    </div>
    <div id="tisly-pwa-update-banner" class="tisly-pwa-update-banner" hidden>
      新しいバージョンがあります。<button type="button">再読み込み</button>
    </div>`;
  wireInstallStrip();
  wireOnlineStatus();
  wireSwitcherToggle();
  loadPwaSwitcher(currentApp);
  if (currentApp === "hub") {
    document.getElementById("btn-hub-sync")?.removeAttribute("hidden");
  }
  import("./connection-badges.js").then((m) => m.loadConnectionBadges()).catch(() => {});
  if (currentApp === "hub") {
    import("./hub-offline-snapshot.js")
      .then((m) => m.wireHubSyncButton())
      .catch(() => {});
  }
}

wireServiceWorkerUpdate();
