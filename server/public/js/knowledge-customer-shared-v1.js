/** Knowledge Customer UI V1 — 共有ユーティリティ */

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INTERNAL_TEXT_RE =
  /(?:QNAP|SMB|WebDAV|192\.168\.|\\\\|filemanager|\/api\/|projectId|userId|mock fallback)/i;

export function containsInternalTextV1(text) {
  return INTERNAL_TEXT_RE.test(String(text ?? ""));
}

export function sanitizeCustomerTextV1(text) {
  if (!text) return "";
  return String(text)
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\\\\[^\s]+/gi, "")
    .replace(/\/api\/[^\s]+/gi, "")
    .replace(/QNAP[^\s]*/gi, "")
    .replace(/WebDAV[^\s]*/gi, "")
    .replace(/SMB[^\s]*/gi, "")
    .replace(/projectId[=:]\S+/gi, "")
    .replace(/userId[=:]\S+/gi, "")
    .trim();
}

export function renderCustomerBottomNavV1(active) {
  return `<nav class="customer-bottom-nav" aria-label="お客様向けナビ">
    <a class="customer-nav-item${active === "home" ? " active" : ""}" href="/knowledge-customer-v1">
      <span class="customer-nav-icon">🏠</span>
      <span class="customer-nav-label">ホーム</span>
    </a>
    <a class="customer-nav-item${active === "field" ? " active" : ""}" href="/knowledge-field-v1">
      <span class="customer-nav-icon">🔧</span>
      <span class="customer-nav-label">現場向け</span>
    </a>
  </nav>`;
}

export function renderCustomerBottomNavV2(active, options = {}) {
  return renderCustomerBottomNavV3(active, options);
}

export function renderCustomerBottomNavV3(active, options = {}) {
  if (options.shareView) {
    return renderCustomerBottomNavShareV1(options);
  }
  const ref = options.projectRef || "DEMO-HOME-001";
  const projectQs = `ref=${encodeURIComponent(ref)}`;
  return `<nav class="customer-bottom-nav customer-bottom-nav-v2 customer-bottom-nav-v3" aria-label="お客様向けナビ">
    <a class="customer-nav-item${active === "home" ? " active" : ""}" href="/knowledge-customer-v2">
      <span class="customer-nav-icon">🏠</span>
      <span class="customer-nav-label">ホーム</span>
    </a>
    <a class="customer-nav-item${active === "projects" ? " active" : ""}" href="/knowledge-customer-projects-v1">
      <span class="customer-nav-icon">📁</span>
      <span class="customer-nav-label">案件</span>
    </a>
    <a class="customer-nav-item${active === "project" ? " active" : ""}" href="/knowledge-customer-project-v1?${projectQs}">
      <span class="customer-nav-icon">📋</span>
      <span class="customer-nav-label">物件</span>
    </a>
    <a class="customer-nav-item${active === "sitemap" ? " active" : ""}" href="/knowledge-customer-site-map-v1?${projectQs}">
      <span class="customer-nav-icon">🗺</span>
      <span class="customer-nav-label">配置</span>
    </a>
    <a class="customer-nav-item${active === "field" ? " active" : ""}" href="/knowledge-field-v1">
      <span class="customer-nav-icon">🔧</span>
      <span class="customer-nav-label">現場</span>
    </a>
  </nav>`;
}

export function isShareViewV1() {
  const params = new URLSearchParams(location.search);
  return params.get("view") === "share";
}

export function appendShareViewQuery(url) {
  if (!isShareViewV1()) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}view=share`;
}

export function renderCustomerBottomNavShareV1(options = {}) {
  const closeUrl = options.closeUrl || options.projectPageUrl || "#";
  const projectUrl = options.projectPageUrl || closeUrl;
  return `<nav class="customer-bottom-nav customer-bottom-nav-v2 customer-bottom-nav-v3 customer-bottom-nav-share" aria-label="お客様共有ナビ">
    <a class="customer-nav-item primary" href="${escapeHtml(appendShareViewQuery(projectUrl))}#pdfs-section">
      <span class="customer-nav-icon">📄</span>
      <span class="customer-nav-label">資料を確認する</span>
    </a>
    <button type="button" class="customer-nav-item" id="customer-share-close-btn" data-close-url="${escapeHtml(closeUrl)}">
      <span class="customer-nav-icon">✕</span>
      <span class="customer-nav-label">閉じる</span>
    </button>
  </nav>`;
}

export function bindCustomerShareCloseV1() {
  const btn = document.getElementById("customer-share-close-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const closeUrl = btn.getAttribute("data-close-url");
    if (closeUrl && closeUrl !== "#") {
      location.href = closeUrl;
      return;
    }
    if (history.length > 1) {
      history.back();
      return;
    }
    window.close();
  });
}

export function renderCustomerProjectListFiltersV4(activeFilter) {
  const filters = [
    { id: "all", label: "すべて" },
    { id: "防犯", label: "防犯" },
    { id: "電気", label: "電気" },
    { id: "工場", label: "工場" },
    { id: "ネットワーク", label: "ネットワーク" },
    { id: "完了", label: "完了" },
    { id: "準備中", label: "準備中" },
  ];
  return `<div class="customer-filter-row-v4">${filters
    .map(
      (f) =>
        `<button type="button" class="customer-filter-chip${activeFilter === f.id ? " active" : ""}" data-filter="${escapeHtml(f.id)}">${escapeHtml(f.label)}</button>`
    )
    .join("")}</div>`;
}

export function renderCustomerPhotoModalV1() {
  return `<div id="customer-photo-modal" class="customer-photo-modal" aria-hidden="true" role="dialog" aria-label="写真拡大">
    <div class="customer-photo-modal-backdrop"></div>
    <div class="customer-photo-modal-panel friendly-card">
      <button type="button" class="customer-photo-modal-close" aria-label="閉じる">✕</button>
      <img id="customer-photo-modal-img" alt="" />
      <p id="customer-photo-modal-label" class="customer-photo-modal-label"></p>
    </div>
  </div>`;
}

export function renderMaterialBadgesV1(item) {
  const badges = [];
  if (item.hasPhoto || item.type === "photo") badges.push("📷 写真あり");
  if (item.hasPdf || item.type === "pdf") badges.push("📄 PDFあり");
  if (item.hasPart || item.type === "part") badges.push("🖨 部品資料あり");
  if (item.hasExplanation || item.type === "explanation") badges.push("💬 説明あり");
  return badges.map((b) => `<span class="customer-material-badge">${escapeHtml(b)}</span>`).join("");
}

export function renderMaterialFilterChipsV1(activeFilter) {
  const filters = [
    { id: "all", label: "すべて" },
    { id: "写真", label: "📷 写真" },
    { id: "pdf", label: "📄 PDF" },
    { id: "防犯", label: "防犯" },
    { id: "電気", label: "電気" },
    { id: "工場", label: "工場" },
    { id: "ネットワーク", label: "ネットワーク" },
  ];
  return filters
    .map(
      (f) =>
        `<button type="button" class="customer-filter-chip${activeFilter === f.id ? " active" : ""}" data-filter="${escapeHtml(f.id)}">${escapeHtml(f.label)}</button>`
    )
    .join("");
}

export function renderCustomerPhotoGalleryV1(photos) {
  if (!photos?.length) {
    return `<div class="customer-photo-placeholder friendly-card">
      <span class="customer-photo-placeholder-icon">📷</span>
      <p>写真は準備中です。説明文で工事内容をご確認いただけます。</p>
    </div>`;
  }
  if (photos.length === 1) {
    return `<div class="customer-photo-hero friendly-card">
      <img src="${escapeHtml(photos[0].previewUrl)}" alt="${escapeHtml(photos[0].label)}" loading="lazy" />
    </div>`;
  }
  return `<div class="customer-photo-scroll friendly-card">
    <div class="customer-photo-track">${photos
      .map(
        (p) =>
          `<figure class="customer-photo-slide"><img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.label)}" loading="lazy" /><figcaption>${escapeHtml(p.label)}</figcaption></figure>`
      )
      .join("")}</div>
  </div>`;
}
