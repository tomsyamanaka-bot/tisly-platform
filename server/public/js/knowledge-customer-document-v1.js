/** Knowledge Customer UI V4 — ref + fileId PDF 閲覧 */

import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  isShareViewV1,
  renderCustomerBottomNavShareV1,
  renderCustomerBottomNavV3,
  bindCustomerShareCloseV1,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function getRef() {
  return new URLSearchParams(location.search).get("ref") || "DEMO-HOME-001";
}

function getFileId() {
  return new URLSearchParams(location.search).get("fileId") || "";
}

function renderDocument(doc) {
  const shareView = Boolean(doc.isShareView || isShareViewV1());
  const frame = doc.hasContent
    ? `<iframe class="customer-document-frame" title="${escapeHtml(doc.safeLabel)}" src="${escapeHtml(doc.viewUrl)}"></iframe>`
    : `<div class="customer-card friendly-card"><p class="status-muted">${escapeHtml(doc.preparingMessage || "資料を準備中です")}</p></div>`;

  return `
    <header class="customer-document-header">
      <a class="customer-action-btn" href="${escapeHtml(doc.projectPageUrl)}">← 戻る</a>
      <div class="customer-document-title">
        <strong>${escapeHtml(sanitizeCustomerTextV1(doc.safeLabel || doc.title))}</strong>
        <small>${escapeHtml(sanitizeCustomerTextV1(doc.customerSafeTitle || doc.propertyName))}</small>
      </div>
    </header>
    ${shareView ? '<p class="customer-share-banner">お客様共有モード — 閲覧専用です</p>' : ""}
    <div class="customer-document-frame-wrap">${frame}</div>
    <div class="customer-document-actions">
      ${
        doc.hasContent
          ? `<a class="customer-action-btn primary customer-pdf-btn-v4" href="${escapeHtml(doc.viewUrl)}" target="_blank" rel="noopener">資料を確認する</a>`
          : `<a class="customer-action-btn primary" href="${escapeHtml(doc.projectPageUrl)}">物件ページへ</a>`
      }
      <button type="button" class="customer-action-btn" id="customer-document-close">閉じる</button>
    </div>
  `;
}

async function loadDocument() {
  const ref = getRef();
  const fileId = getFileId();
  const token = getCustomerToken();
  const qs = new URLSearchParams({ ref, fileId });
  if (isShareViewV1()) qs.set("view", "share");

  const res = await fetch(`/api/knowledge/customer-document-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  const doc = data.document;
  if (!res.ok || !doc) {
    $("customer-document-root").innerHTML =
      '<div class="customer-card friendly-card"><p class="status-muted">資料を準備中です。</p></div>';
    return;
  }

  let viewUrl = doc.viewUrl;
  if (doc.hasContent && doc.viewUrl) {
    const fileRes = await fetch(doc.viewUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (fileRes.ok) {
      const blob = await fileRes.blob();
      viewUrl = URL.createObjectURL(blob);
      doc.viewUrl = viewUrl;
    }
  }

  $("customer-document-root").innerHTML = renderDocument(doc);
  document.title = `TiSLY — ${doc.safeLabel || "資料"}`;

  if (doc.isShareView || isShareViewV1()) {
    $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavShareV1({
      projectPageUrl: doc.projectPageUrl,
      closeUrl: doc.closeUrl,
    });
    bindCustomerShareCloseV1();
  } else {
    $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV3("project", { projectRef: ref });
  }

  $("customer-document-close")?.addEventListener("click", () => {
    location.href = doc.closeUrl || doc.projectPageUrl;
  });
}

async function init() {
  await requireCustomerLogin();
  await loadDocument();
}

init();
