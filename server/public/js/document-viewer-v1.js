import { getCustomerToken, requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import {
  sharePdfBlobAsFile,
  fetchPdfBlobWithRegenerate,
  openPdfBlob,
  isValidPdfBlob,
  prefetchPdfForShare,
  triggerDownload,
} from "./pdf-share-v1.js";

const MOBILE_BREAKPOINT = 768;
const API = "/api/estimate/v1";

const $ = (id) => document.getElementById(id);

let payload = null;
let lightboxPhotos = [];
let lightboxIndex = 0;
let pdfBlobUrl = null;
let cachedPdfBlob = null;
let mobileMode = false;
/** @type {'preview' | 'pdf'} */
let viewMode = "preview";

function toast(msg, { durationMs = 2200 } = {}) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), durationMs);
}

function yen(n) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMobileViewport() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function parseParams() {
  const q = new URLSearchParams(window.location.search);
  const kind = q.get("kind") || "estimate";
  const projectId = q.get("projectId") || "";
  const returnUrl = q.get("return") || "";
  return { kind, projectId, returnUrl };
}

function buildPdfTabUrl(pdfPath) {
  const token = getCustomerToken();
  const sep = pdfPath.includes("?") ? "&" : "?";
  return `${pdfPath}${sep}access_token=${encodeURIComponent(token)}`;
}

async function fetchPayload(projectId, kind) {
  const token = getCustomerToken();
  const res = await fetch(`${API}/projects/${encodeURIComponent(projectId)}/document-view?kind=${encodeURIComponent(kind)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function pdfAuthHeaders() {
  return { Authorization: `Bearer ${getCustomerToken()}` };
}

function getRegenerateUrl() {
  return payload?.regenerateUrl || null;
}

async function fetchDocumentPdfBlob({ forceRefresh = false } = {}) {
  if (!payload?.pdfUrl) throw new Error("PDF URLがありません");
  if (!forceRefresh && cachedPdfBlob && isValidPdfBlob(cachedPdfBlob)) return cachedPdfBlob;
  const blob = await fetchPdfBlobWithRegenerate({
    fetchUrl: buildPdfTabUrl(payload.pdfUrl),
    headers: pdfAuthHeaders(),
    regenerateUrl: getRegenerateUrl(),
    getRegenerateHeaders: pdfAuthHeaders,
  });
  cachedPdfBlob = blob;
  return blob;
}

function setPdfFrameBlob(blob) {
  if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  pdfBlobUrl = URL.createObjectURL(blob);
  $("pdf-frame").src = pdfBlobUrl;
}

async function loadPdfFrame() {
  if (!payload?.pdfUrl) throw new Error("PDF URLがありません");
  const blob = await fetchDocumentPdfBlob();
  setPdfFrameBlob(blob);
}

function renderEstimateMobile(est) {
  const itemsHtml = est.items
    .map(
      (item) => `<article class="doc-line-card">
        <p class="doc-line-name">${escapeHtml(item.name)}</p>
        <div class="doc-line-grid">
          <div><span>数量</span><strong>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</strong></div>
          <div><span>単価</span><strong>${yen(item.unitPrice)}</strong></div>
          <div><span>金額</span><strong>${yen(item.amount)}</strong></div>
        </div>
      </article>`
    )
    .join("");

  const discountRow =
    est.shuseiDiscount > 0
      ? `<div class="doc-totals-row discount"><span>出精値引き</span><span>−${yen(est.shuseiDiscount)}</span></div>`
      : "";

  $("doc-fixed-total").classList.remove("hidden");
  $("doc-fixed-total").innerHTML = `<span>税込合計</span><span class="amount">${yen(est.total)}</span>`;

  return `
    <div class="doc-hero-card">
      <p class="doc-hero-label">御見積金額（税込）</p>
      <p class="doc-hero-amount">${yen(est.total)}</p>
    </div>
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(est.addressee)}</strong> 様</p>
      <p>${escapeHtml(est.subject)}</p>
      <p class="muted">見積番号 ${escapeHtml(est.docNo)} · ${escapeHtml(est.issueDate)}</p>
      ${est.staffName ? `<p class="muted">担当 ${escapeHtml(est.staffName)}</p>` : ""}
    </div>
    ${itemsHtml}
    <div class="doc-totals-card">
      <div class="doc-totals-row"><span>明細合計</span><span>${yen(est.lineSubtotal)}</span></div>
      ${discountRow}
      <div class="doc-totals-row"><span>税抜小計</span><span>${yen(est.subtotal)}</span></div>
      <div class="doc-totals-row"><span>消費税（10%）</span><span>${yen(est.tax)}</span></div>
      <div class="doc-totals-row"><span><strong>税込合計</strong></span><span><strong>${yen(est.total)}</strong></span></div>
    </div>
    ${est.notes ? `<div class="doc-meta-card"><p class="muted">備考</p><p>${escapeHtml(est.notes)}</p></div>` : ""}`;
}

function renderInvoiceMobile(inv) {
  $("doc-fixed-total").classList.remove("hidden");
  $("doc-fixed-total").innerHTML = `<span>請求金額（税込）</span><span class="amount">${yen(inv.total)}</span>`;

  const itemsHtml = inv.items
    .map(
      (item) => `<article class="doc-line-card">
        <p class="doc-line-name">${escapeHtml(item.name)}</p>
        <div class="doc-line-grid">
          <div><span>数量</span><strong>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</strong></div>
          <div><span>単価</span><strong>${yen(item.unitPrice)}</strong></div>
          <div><span>金額</span><strong>${yen(item.amount)}</strong></div>
        </div>
      </article>`
    )
    .join("");

  return `
    <div class="doc-hero-card">
      <p class="doc-hero-label">請求金額（税込）</p>
      <p class="doc-hero-amount">${yen(inv.total)}</p>
    </div>
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(inv.addressee)}</strong> 様</p>
      <p>${escapeHtml(inv.subject)}</p>
      <p class="muted">請求番号 ${escapeHtml(inv.docNo)} · 支払期限 ${escapeHtml(inv.paymentDueDate || "—")}</p>
    </div>
    ${itemsHtml}
    <div class="doc-bank-card">
      <h3>振込先</h3>
      <p class="doc-bank-text" id="bank-info-text">${escapeHtml(inv.bankInfo || "—")}</p>
      <button type="button" class="doc-copy-btn" id="btn-copy-bank">振込先をコピー</button>
    </div>`;
}

function renderPhotoItem(p, i) {
  return `<figure class="doc-photo-item" data-photo-index="${i}" role="button" tabindex="0">
    <div class="doc-photo-img-wrap">
      <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.title)}" loading="lazy" />
    </div>
    <figcaption class="doc-photo-caption">${escapeHtml(p.title)}</figcaption>
  </figure>`;
}

function renderPhotoList(photos, { grid = false } = {}) {
  if (!photos.length) {
    return `<div class="doc-meta-card"><p class="muted">写真はありません</p></div>`;
  }
  lightboxPhotos = photos;
  const listClass = grid ? "doc-photo-grid" : "doc-photo-list";
  return `<div class="${listClass}">
    ${photos.map((p, i) => renderPhotoItem(p, i)).join("")}
  </div>`;
}

function renderSpecificationMobile(spec) {
  return `
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(spec.addressee)}</strong> 様</p>
      <p>${escapeHtml(spec.subject)}</p>
      <p class="muted">${escapeHtml(spec.workLocation || spec.siteName)}</p>
      <p class="muted">作成日 ${escapeHtml(spec.issueDate)}${spec.estimateNo ? ` · 見積 ${escapeHtml(spec.estimateNo)}` : ""}</p>
    </div>
    ${spec.notes ? `<div class="doc-meta-card"><p class="muted">備考</p><p>${escapeHtml(spec.notes)}</p></div>` : ""}
    ${renderPhotoList(spec.photos, { grid: true })}`;
}

function renderCompletionMobile(cr) {
  return `
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(cr.addressee)}</strong> 様</p>
      <p>${escapeHtml(cr.subject)}</p>
      <p class="muted">${escapeHtml(cr.workLocation || cr.siteName)}</p>
      ${cr.staffName ? `<p class="muted">担当 ${escapeHtml(cr.staffName)}</p>` : ""}
    </div>
    ${cr.workContent ? `<div class="doc-meta-card"><p class="muted">作業内容</p><p>${escapeHtml(cr.workContent)}</p></div>` : ""}
    <p class="section-label" style="margin:0.75rem 0 0;">写真</p>
    ${renderPhotoList(cr.photos, { grid: true })}`;
}

function renderFieldReportMobile(fr) {
  const materialsHtml = fr.materials.length
    ? fr.materials
        .map(
          (m) => `<article class="doc-line-card">
            <p class="doc-line-name">${escapeHtml(m.label)}</p>
            <p class="doc-line-amount">${escapeHtml(m.quantity)} ${escapeHtml(m.unit)}</p>
          </article>`
        )
        .join("")
    : `<div class="doc-meta-card"><p class="muted">部材記録はありません</p></div>`;

  return `
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(fr.siteName)}</strong></p>
      <p>${escapeHtml(fr.customerName)}</p>
      <p class="muted">📍 ${escapeHtml(fr.address || "—")}</p>
      <p class="muted">現調日 ${escapeHtml(fr.surveyDate || "—")}${fr.assignee ? ` · 担当 ${escapeHtml(fr.assignee)}` : ""}</p>
    </div>
    ${fr.notes ? `<div class="doc-meta-card"><p class="muted">メモ</p><p>${escapeHtml(fr.notes)}</p></div>` : ""}
    <p class="section-label" style="margin:0.5rem 0 0;">部材</p>
    ${materialsHtml}
    <p class="section-label" style="margin:0.75rem 0 0;">現場写真</p>
    ${renderPhotoList(fr.photos)}`;
}

function renderMobileView(data) {
  let html = "";
  switch (data.kind) {
    case "estimate":
      html = renderEstimateMobile(data.estimate);
      break;
    case "invoice":
      html = renderInvoiceMobile(data.invoice);
      break;
    case "specification":
      html = renderSpecificationMobile(data.specification);
      break;
    case "completion-report":
      html = renderCompletionMobile(data.completionReport);
      break;
    case "field-report":
      html = renderFieldReportMobile(data.fieldReport);
      break;
    default:
      html = `<div class="doc-meta-card"><p>未対応の書類種別です</p></div>`;
  }
  $("doc-mobile").innerHTML = html;
  bindMobileInteractions(data);
}

function bindMobileInteractions(data) {
  $("btn-copy-bank")?.addEventListener("click", async () => {
    const text = data.invoice?.bankInfo || "";
    try {
      await navigator.clipboard.writeText(text);
      toast("振込先をコピーしました");
    } catch {
      toast("コピーに失敗しました");
    }
  });

  document.querySelectorAll(".doc-photo-item").forEach((el) => {
    const open = () => openLightbox(Number(el.dataset.photoIndex || 0));
    el.addEventListener("click", open);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });

}

function openLightbox(index) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = index;
  updateLightbox();
  $("photo-lightbox").classList.remove("hidden");
}

function updateLightbox() {
  const photo = lightboxPhotos[lightboxIndex];
  if (!photo) return;
  $("lightbox-img").src = photo.url;
  $("lightbox-img").alt = photo.title;
  $("lightbox-caption").textContent = photo.title;
  $("lightbox-prev").classList.toggle("hidden", lightboxPhotos.length <= 1);
  $("lightbox-next").classList.toggle("hidden", lightboxPhotos.length <= 1);
}

function closeLightbox() {
  $("photo-lightbox").classList.add("hidden");
}

function clearPdfFrame() {
  if (pdfBlobUrl) {
    URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = null;
  }
  const frame = $("pdf-frame");
  if (frame) frame.src = "about:blank";
}

function updateFixedTotalVisibility() {
  const bar = $("doc-fixed-total");
  if (!bar) return;
  if (viewMode !== "preview") {
    bar.classList.add("hidden");
    return;
  }
  const show = payload?.kind === "estimate" || payload?.kind === "invoice";
  bar.classList.toggle("hidden", !show);
}

function showPreviewMode() {
  viewMode = "preview";
  document.body.classList.remove("doc-pdf-view-mode");
  document.body.classList.add("doc-preview-mode");
  $("doc-mobile")?.classList.remove("hidden");
  $("doc-desktop")?.classList.add("hidden");
  clearPdfFrame();
  updateFixedTotalVisibility();
}

async function showPdfViewMode() {
  viewMode = "pdf";
  document.body.classList.remove("doc-preview-mode");
  document.body.classList.add("doc-pdf-view-mode");
  $("doc-mobile")?.classList.add("hidden");
  $("doc-desktop")?.classList.remove("hidden");
  $("doc-fixed-total")?.classList.add("hidden");
  await loadPdfFrame();
}

function applyLayoutMode() {
  mobileMode = isMobileViewport();
  if (viewMode === "pdf") {
    showPdfViewMode().catch((e) => {
      $("doc-error")?.classList.remove("hidden");
      $("doc-error").innerHTML = renderFriendlyErrorHtml(e);
    });
  } else {
    showPreviewMode();
  }
}

async function regenerateStoredPdf() {
  if (!payload?.regenerateUrl) {
    toast("この書類はPDF再作成に対応していません");
    return;
  }
  if (!confirm("内容を反映してPDFを再作成しますか？\n保存済みPDFが上書きされます。")) return;
  const token = getCustomerToken();
  const res = await fetch(payload.regenerateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "PDF再作成に失敗しました"), { status: res.status });
  payload = {
    ...payload,
    storedPdfPath: data.pdfPath ?? payload.storedPdfPath,
    hasStoredPdf: Boolean(data.pdfPath ?? payload.hasStoredPdf),
  };
  cachedPdfBlob = null;
  toast("PDFを再作成しました");
  await loadPdfFrame();
}

function updateRegenerateButton(data) {
  const btn = $("btn-regenerate");
  if (!btn) return;
  const show = Boolean(data.regenerateUrl);
  btn.classList.toggle("hidden", !show);
  btn.title = data.hasStoredPdf ? "PDF再作成（保存済みを上書き）" : "PDF作成";
}

function updateHeader(data) {
  $("header-kind").textContent = data.label;
  $("header-title").textContent = data.projectTitle;
  document.title = `TiSLY — ${data.label}`;
  updateRegenerateButton(data);
}

function getShareFileName() {
  return payload?.shareFileName || `${payload?.kind || "document"}.pdf`;
}

function prefetchPdfOnTouch() {
  if (!payload?.pdfUrl) return;
  prefetchPdfForShare({
    fetchUrl: buildPdfTabUrl(payload.pdfUrl),
    getHeaders: pdfAuthHeaders,
    regenerateUrl: getRegenerateUrl(),
  })
    .then((blob) => {
      cachedPdfBlob = blob;
    })
    .catch(() => {});
}

async function resolvePdfBlob({ forceRefresh = false } = {}) {
  if (!payload?.pdfUrl) throw new Error("PDFがありません");
  if (!forceRefresh && cachedPdfBlob && isValidPdfBlob(cachedPdfBlob)) return cachedPdfBlob;
  const blob = await fetchDocumentPdfBlob({ forceRefresh });
  cachedPdfBlob = blob;
  return blob;
}

async function handlePdfOpen() {
  if (!payload?.pdfUrl) {
    toast("PDFがありません");
    return;
  }
  try {
    await resolvePdfBlob();
    await showPdfViewMode();
  } catch (e) {
    toast(e.message || "PDFの取得に失敗しました");
  }
}

async function handleSaveFile() {
  if (!payload?.pdfUrl) {
    toast("PDFがありません");
    return;
  }
  const fileName = getShareFileName();
  try {
    const blob = await resolvePdfBlob();
    triggerDownload(blob, fileName);
    toast("PDFをファイルに保存しました");
  } catch (e) {
    toast(e.message || "PDFの保存に失敗しました");
  }
}

async function handleShare() {
  if (!payload?.pdfUrl) {
    toast("PDFがありません");
    return;
  }
  const fileName = getShareFileName();
  try {
    const pdfBlob = await resolvePdfBlob();
    await sharePdfBlobAsFile(pdfBlob, fileName, toast);
  } catch (e) {
    if (e?.name === "AbortError") return;
    toast(e.message || "共有に失敗しました");
  }
}

async function handlePrint() {
  if (!payload?.pdfUrl) {
    toast("PDFがありません");
    return;
  }
  try {
    const blob = await fetchDocumentPdfBlob();
    if (mobileMode) {
      openPdfBlob(blob);
      return;
    }
    setPdfFrameBlob(blob);
    const frame = $("pdf-frame");
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        openPdfBlob(blob);
      }
      frame.onload = null;
    };
  } catch (e) {
    toast(e.message || "印刷用PDFの取得に失敗しました");
  }
}

function handleBack(returnUrl) {
  if (viewMode === "pdf") {
    showPreviewMode();
    return;
  }
  if (returnUrl && returnUrl.startsWith("/")) {
    window.location.href = returnUrl;
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  if (payload?.projectId) {
    window.location.href = `/projects-v1?projectId=${encodeURIComponent(payload.projectId)}`;
    return;
  }
  window.location.href = "/estimate-v1";
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  const { kind, projectId, returnUrl } = parseParams();

  if (!projectId) {
    $("doc-loading").classList.add("hidden");
    $("doc-error").classList.remove("hidden");
    $("doc-error").textContent = "案件IDが指定されていません";
    return;
  }

  $("btn-back").addEventListener("click", () => handleBack(returnUrl));
  $("btn-regenerate")?.addEventListener("click", () => {
    regenerateStoredPdf().catch((e) => toast(e.message || "PDF再作成に失敗しました"));
  });
  $("btn-share").addEventListener("click", () => handleShare());
  $("btn-share").addEventListener("touchstart", prefetchPdfOnTouch, { passive: true });
  $("btn-save")?.addEventListener("click", () => handleSaveFile());
  $("btn-save")?.addEventListener("touchstart", prefetchPdfOnTouch, { passive: true });
  $("btn-pdf").addEventListener("click", () => handlePdfOpen());
  $("btn-pdf").addEventListener("touchstart", prefetchPdfOnTouch, { passive: true });
  $("btn-print").addEventListener("click", () => handlePrint());

  $("lightbox-close").addEventListener("click", closeLightbox);
  $("photo-lightbox").addEventListener("click", (ev) => {
    if (ev.target === $("photo-lightbox")) closeLightbox();
  });
  $("lightbox-prev").addEventListener("click", (ev) => {
    ev.stopPropagation();
    lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length;
    updateLightbox();
  });
  $("lightbox-next").addEventListener("click", (ev) => {
    ev.stopPropagation();
    lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length;
    updateLightbox();
  });

  window.addEventListener("resize", () => {
    applyLayoutMode();
  });

  try {
    payload = await fetchPayload(projectId, kind);
    updateHeader(payload);
    renderMobileView(payload);
    $("doc-loading").classList.add("hidden");
    showPreviewMode();
    applyLayoutMode();
  } catch (e) {
    $("doc-loading").classList.add("hidden");
    $("doc-error").classList.remove("hidden");
    $("doc-error").innerHTML = renderFriendlyErrorHtml(e, e.status);
  }
}

init().catch(console.error);
