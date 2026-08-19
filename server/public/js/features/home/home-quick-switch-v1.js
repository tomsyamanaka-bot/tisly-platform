/**
 * TiSLY HOME クイック切り替え v1
 *
 * どの画面に読み込んでも右下へ
 * 「🏠 TiSLY HOME」ボタンを追加する。
 * 既存 DOM は変更せず body へ追記のみ。
 *
 * 使い方（各画面の body 末尾）
 *   <script type="module"
 *     src="/js/features/home/home-quick-switch-v1.js"></script>
 *
 * data-hqs-mode="customer" を html/body に付けると
 * お客様向けリンク（/customer/home）へ切り替わる。
 */

const CSS_HREF = "/css/features/home/home-quick-switch-v1.css";
const API_URL = "/api/home/v1/quick-switch";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureStylesheet() {
  const exists = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  ).some((link) => (link.getAttribute("href") || "").startsWith(CSS_HREF));
  if (exists) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

function resolveMode() {
  const attr =
    document.body?.dataset?.hqsMode ||
    document.documentElement?.dataset?.hqsMode ||
    "";
  if (attr === "customer") return "customer";
  if (attr === "internal") return "internal";
  return location.pathname.startsWith("/customer")
    ? "customer"
    : "internal";
}

async function loadItems() {
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) return [];
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

function buildFab() {
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "hqs-fab";
  fab.setAttribute("aria-haspopup", "dialog");
  fab.setAttribute("aria-label", "TiSLY HOME を開く");
  fab.innerHTML =
    '<span class="hqs-fab-emoji" aria-hidden="true">🏠</span>' +
    "<span>TiSLY HOME</span>";
  return fab;
}

function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "hqs-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="hqs-sheet">
      <h2 class="hqs-sheet-title">TiSLY HOME</h2>
      <p class="hqs-sheet-sub">
        分電盤CT · 給湯 · エアコン · 玄関錠をまとめて確認
      </p>
      <div class="hqs-list" data-hqs-list>
        <p class="hqs-empty">読み込み中…</p>
      </div>
      <button type="button" class="hqs-close" data-hqs-close>
        閉じる
      </button>
    </div>`;
  return overlay;
}

function renderItems(listEl, items, mode) {
  if (!items.length) {
    listEl.innerHTML =
      '<p class="hqs-empty">表示できる住まいがありません</p>';
    return;
  }
  listEl.innerHTML = items
    .map((item) => {
      const href =
        mode === "customer" ? item.customerHref : item.internalHref;
      const meta =
        mode === "customer"
          ? escapeHtml(item.statusLabel)
          : `${escapeHtml(item.countryCode)} / ${escapeHtml(
              item.currency
            )} · ${escapeHtml(item.statusLabel)}`;
      return `
        <a class="hqs-item" href="${escapeHtml(href)}">
          <span>
            <span class="hqs-item-name">${escapeHtml(
              item.displayName
            )}</span>
            <span class="hqs-item-meta">${meta}</span>
          </span>
          <span class="hqs-item-status" aria-hidden="true">${escapeHtml(
            item.statusEmoji
          )}</span>
        </a>`;
    })
    .join("");
}

function mount() {
  if (document.querySelector(".hqs-fab")) return;
  ensureStylesheet();

  const mode = resolveMode();
  const fab = buildFab();
  const direct = document.body?.dataset?.hqsDirect;
  document.body.appendChild(fab);

  if (direct) {
    fab.addEventListener("click", () => {
      location.href = direct;
    });
    return;
  }

  const overlay = buildOverlay();
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector("[data-hqs-list]");
  let loaded = false;

  const close = () => {
    overlay.hidden = true;
  };

  fab.addEventListener("click", async () => {
    overlay.hidden = false;
    if (loaded) return;
    loaded = true;
    const items = await loadItems();
    renderItems(listEl, items, mode);
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay
    .querySelector("[data-hqs-close]")
    ?.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) close();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
