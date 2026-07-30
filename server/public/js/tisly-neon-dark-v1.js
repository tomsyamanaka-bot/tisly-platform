/**
 * TiSLY Neon Dark Mode v1
 * 既存DOM/データを消さず、
 * CSS追記と発光アニメのみ適用する。
 */

export const NEON_DARK_VERSION = "neon-dark-v1";

const CSS_HREF = "/css/tisly-neon-dark-v1.css";
const LINK_ID = "tisly-neon-dark-v1-css";
const BODY_CLASS = "tisly-neon-dark";

/** お客様向け白基調UIは対象外 */
function isCustomerFacingPath(pathname) {
  const p = String(pathname || "");
  return (
    p === "/customer" ||
    p.startsWith("/customer/") ||
    p.includes("knowledge-customer") ||
    p.includes("customer-v1") ||
    p.includes("customer-home") ||
    p.includes("customer-project") ||
    p.includes("customer-document") ||
    p.includes("customer-monitoring")
  );
}

/** CSSリンクを1回だけ追記 */
function ensureNeonStylesheet() {
  if (document.getElementById(LINK_ID)) return;
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

/** theme-color をネオン基調へ（追記上書き） */
function applyThemeColorMeta() {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", "#0d0f12");
}

/**
 * タップ時の発光クラスを付与
 * （リレー/スイッチ/主要ボタン）
 */
function bindNeonTapGlow(root) {
  const scope = root || document;
  const selector = [
    ".btn-hero",
    ".btn-main",
    ".btn-sub",
    ".btn-login-friendly",
    ".btn-hero-neon",
    ".btn-doc-action",
    ".tisly-neon-switch",
    ".rv-device",
    ".rv-toggle",
    '[data-neon-control="relay"]',
    '[data-neon-control="switch"]',
    ".tisly-practical-bottomnav a",
    ".tisly-practical-bottomnav button",
  ].join(",");

  scope.querySelectorAll(selector).forEach((el) => {
    if (el.dataset.neonGlowBound === "1") return;
    el.dataset.neonGlowBound = "1";
    el.addEventListener(
      "pointerdown",
      () => {
        el.classList.remove("tisly-neon-pulse");
        // 再トリガーのため強制リフロー
        void el.offsetWidth;
        el.classList.add("tisly-neon-pulse");
        window.setTimeout(() => {
          el.classList.remove("tisly-neon-pulse");
        }, 480);
      },
      { passive: true }
    );
  });
}

/**
 * 動的追加ノードにも発光を再バインド
 */
function observeDynamicControls() {
  if (typeof MutationObserver === "undefined") return;
  if (document.documentElement.dataset.neonObserver === "1") return;
  document.documentElement.dataset.neonObserver = "1";
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        bindNeonTapGlow(document);
        break;
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

/**
 * ネオンダークUIを有効化（追記のみ）
 * @returns {{ enabled: boolean; version: string }}
 */
export function enableNeonDarkModeV1() {
  if (typeof document === "undefined") {
    return { enabled: false, version: NEON_DARK_VERSION };
  }
  if (isCustomerFacingPath(location.pathname)) {
    return { enabled: false, version: NEON_DARK_VERSION };
  }

  ensureNeonStylesheet();
  document.body.classList.add(BODY_CLASS);
  applyThemeColorMeta();
  bindNeonTapGlow(document);
  observeDynamicControls();

  return { enabled: true, version: NEON_DARK_VERSION };
}

/** practical-nav からのマウント入口 */
export function mountNeonDarkModeV1() {
  return enableNeonDarkModeV1();
}

// モジュール直読込時も適用
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      enableNeonDarkModeV1();
    });
  } else {
    enableNeonDarkModeV1();
  }
}
