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
