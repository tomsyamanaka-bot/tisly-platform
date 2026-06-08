/** TiSLY 実務 PWA 共通ナビ — 戻る/進む/アプリ一覧 + 下部タブ */

const BOTTOM_ITEMS = [
  { id: "hub", label: "アプリ一覧", icon: "🏠", href: "/app" },
  { id: "survey_v1", label: "現調", icon: "📋", href: "/survey-v1" },
  { id: "estimate_v1", label: "見積", icon: "💰", href: "/estimate-v1" },
  { id: "work_report", label: "作業報告", icon: "📝", href: null, comingSoon: true },
  { id: "customer_mgmt", label: "顧客", icon: "👥", href: null, comingSoon: true },
  { id: "inventory", label: "在庫", icon: "📦", href: null, comingSoon: true },
];

let toastFn = null;

function defaultToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

/**
 * @param {{ appId: string; appName: string; theme?: 'green'|'blue'|'hub'; onBack?: () => void }} opts
 */
export function initPracticalNav(opts) {
  const { appId, appName, theme = "green", onBack } = opts;
  document.body.classList.add("has-practical-nav");

  let backHandler = onBack || (() => window.history.back());

  const topRoot = document.createElement("div");
  topRoot.id = "tisly-practical-topbar-root";
  topRoot.innerHTML = `
    <nav class="tisly-practical-topbar theme-${theme}" aria-label="画面上部ナビ">
      <button type="button" class="nav-btn" id="tisly-nav-back" aria-label="戻る">← 戻る</button>
      <button type="button" class="nav-btn" id="tisly-nav-forward" aria-label="進む">進む →</button>
      <span class="nav-title" id="tisly-nav-title">${escapeHtml(appName)}</span>
      <a class="nav-btn" id="tisly-nav-home" href="/app" aria-label="アプリ一覧">🏠</a>
    </nav>`;
  document.body.prepend(topRoot);

  const bottomRoot = document.createElement("nav");
  bottomRoot.id = "tisly-practical-bottomnav-root";
  bottomRoot.className = "tisly-practical-bottomnav";
  bottomRoot.setAttribute("aria-label", "アプリ切替");
  bottomRoot.innerHTML = BOTTOM_ITEMS.map((item) => {
    const active = item.id === appId ? " active" : "";
    const themeCls = theme === "blue" && item.id === appId ? " theme-blue" : "";
    if (item.comingSoon || !item.href) {
      return `<button type="button" class="coming-soon${active}${themeCls}" data-coming-soon="1" aria-label="${item.label}（準備中）">
        <span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`;
    }
    return `<a href="${item.href}" class="${active.trim()}${themeCls}" aria-current="${item.id === appId ? "page" : "false"}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span></a>`;
  }).join("");
  document.body.appendChild(bottomRoot);

  const btnBack = document.getElementById("tisly-nav-back");
  const btnForward = document.getElementById("tisly-nav-forward");
  const titleEl = document.getElementById("tisly-nav-title");

  btnBack?.addEventListener("click", () => backHandler());
  btnForward?.addEventListener("click", () => window.history.forward());

  bottomRoot.querySelectorAll("[data-coming-soon]").forEach((btn) => {
    btn.addEventListener("click", () => {
      (toastFn || defaultToast)("準備中です。もう少しお待ちください");
    });
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  return {
    setTitle(title) {
      if (titleEl) titleEl.textContent = title;
    },
    setBackVisible(visible) {
      btnBack?.classList.toggle("hidden-nav", !visible);
    },
    setBackHandler(fn) {
      backHandler = fn || (() => window.history.back());
    },
    setToast(fn) {
      toastFn = fn;
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
