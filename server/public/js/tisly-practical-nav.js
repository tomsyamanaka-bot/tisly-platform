/** TiSLY 実務 PWA 共通ナビ — 戻る/進む/アプリ一覧 + 下部タブ */

import {
  bindPopstateBackGuard,
  initNavigationStack,
  navigateBackOne,
  navigateTo,
  getDefaultNavFallbackV1,
} from "./tisly-navigation-stack-v1.js";

const BOTTOM_ITEMS = [
  { id: "schedule_v1", label: "日程", icon: "📅", href: "/schedule-v1" },
  { id: "survey_v1", label: "現調", icon: "📋", href: "/survey-v1" },
  // 見積・請求は同一 PWA 内タブ切替のため
  // フッターは1ボタンに統合
  {
    id: "estimate_billing_v1",
    label: "見積・請求",
    icon: "💰",
    href: "/estimate-v1",
    activeIds: ["estimate_v1", "billing_v1"],
  },
  { id: "knowledge_module_v1", label: "ナレッジ", icon: "💡", href: "/knowledge-module-v1" },
  { id: "projects_v1", label: "案件", icon: "📊", href: "/projects-v1" },
  { id: "field_site_v1", label: "現場", icon: "📂", href: "/field-checklist-v1" },
  { id: "field_check_v1", label: "材料", icon: "🎒", href: "/field-check-v1" },
  { id: "purchase_v1", label: "発注", icon: "📦", href: "/field-check-v1?tab=orders" },
];

/** フッター項目が現在画面と一致するか */
function isBottomItemActive(item, appId) {
  if (item.id === appId) return true;
  if (Array.isArray(item.activeIds) && item.activeIds.includes(appId)) return true;
  return false;
}

let toastFn = null;

function defaultToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

function bindNavLink(el) {
  el.addEventListener("click", (e) => {
    const href = el.getAttribute("href");
    if (!href || !href.startsWith("/") || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateTo(href);
  });
}

/**
 * @param {{ appId: string; appName: string; theme?: 'green'|'blue'|'hub'|'orange'; onBack?: () => void }} opts
 */
export function initPracticalNav(opts) {
  const { appId, appName, theme = "green", onBack } = opts;
  initNavigationStack();
  document.body.classList.add("has-practical-nav");

  const defaultBack = () => navigateBackOne(getDefaultNavFallbackV1(location.pathname));
  let backHandler = onBack || defaultBack;
  bindPopstateBackGuard(() => backHandler());

  const topRoot = document.createElement("div");
  topRoot.id = "tisly-practical-topbar-root";
  topRoot.innerHTML = `
    <nav class="tisly-practical-topbar theme-${theme}" aria-label="画面上部ナビ">
      <button type="button" class="nav-btn" id="tisly-nav-back" aria-label="戻る">← 戻る</button>
      <button type="button" class="nav-btn" id="tisly-nav-forward" aria-label="進む" disabled>進む →</button>
      <span class="nav-title" id="tisly-nav-title">${escapeHtml(appName)}</span>
      <a class="nav-btn" id="tisly-nav-home" href="/app" aria-label="アプリ一覧">🏠</a>
    </nav>`;
  document.body.prepend(topRoot);

  const bottomRoot = document.createElement("nav");
  bottomRoot.id = "tisly-practical-bottomnav-root";
  bottomRoot.className = "tisly-practical-bottomnav";
  bottomRoot.setAttribute("aria-label", "アプリ切替");
  bottomRoot.innerHTML = BOTTOM_ITEMS.map((item) => {
    const isActive = isBottomItemActive(item, appId);
    const active = isActive ? " active" : "";
    const themeCls =
      (theme === "blue" || theme === "orange") && isActive ? ` theme-${theme}` : "";
    if (item.comingSoon || !item.href) {
      return `<button type="button" class="coming-soon${active}${themeCls}" data-coming-soon="1" aria-label="${item.label}（準備中）">
        <span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span><span class="nav-soon-badge">準備中</span></button>`;
    }
    return `<a href="${item.href}" class="${active.trim()}${themeCls}" aria-current="${isActive ? "page" : "false"}">
      <span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></a>`;
  }).join("");
  document.body.appendChild(bottomRoot);

  const btnBack = document.getElementById("tisly-nav-back");
  const btnForward = document.getElementById("tisly-nav-forward");
  const titleEl = document.getElementById("tisly-nav-title");
  const homeLink = document.getElementById("tisly-nav-home");

  btnBack?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnBack?.hasAttribute("disabled")) return;
    backHandler();
  });
  btnForward?.addEventListener("click", () => {
    (toastFn || defaultToast)("この画面では「進む」は使えません");
  });

  bottomRoot.querySelectorAll("a[href]").forEach(bindNavLink);
  homeLink && bindNavLink(homeLink);

  bottomRoot.querySelectorAll("[data-coming-soon]").forEach((btn) => {
    btn.addEventListener("click", () => {
      (toastFn || defaultToast)("準備中です。公開まで少々お待ちください");
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
      if (visible) btnBack?.removeAttribute("disabled");
    },
    setBackHandler(fn) {
      backHandler = fn || defaultBack;
    },
    setForwardEnabled(_enabled) {
      btnForward?.toggleAttribute("disabled", true);
    },
    setToast(fn) {
      toastFn = fn;
    },
    syncHistoryButtons() {
      /* ブラウザ履歴非依存 — 互換のため空実装 */
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
