import { getCustomerToken, requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import {
  sharePdfBlobAsFile,
  fetchPdfBlobWithRegenerate,
  openPdfBlob,
  isValidPdfBlob,
  prefetchPdfForShare,
  triggerDownload,
  clearBlobUrlsFromPage,
} from "./pdf-share-v1.js";
import { bindPopstateBackGuard, initNavigationStack, navigateBackOne } from "./tisly-navigation-stack-v1.js";

const MOBILE_BREAKPOINT = 768;
const API = "/api/estimate/v1";
const DOCUMENT_CENTER_FALLBACK = "/document-center-v1";

const $ = (id) => document.getElementById(id);

let payload = null;
let lightboxPhotos = [];
let lightboxIndex = 0;
let pdfBlobUrl = null;
let cachedPdfBlob = null;
let mobileMode = false;
/** @type {'preview' | 'pdf'} */
let viewMode = "preview";
/** 見積プレビュー上の領収書モード */
let receiptMode = false;
const DEFAULT_RECEIPT_PROVISO = "但 TVアンテナ・防犯カメラ工事代金として";

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
  const returnUrl = q.get("return") || q.get("returnUrl") || "";
  const receipt = q.get("receipt") === "1" || q.get("mode") === "receipt";
  return { kind, projectId, returnUrl, receipt };
}

function resolveDocumentReturn(returnUrl, projectId) {
  if (returnUrl && returnUrl.startsWith("/")) return returnUrl;
  if (projectId) {
    return `${DOCUMENT_CENTER_FALLBACK}?projectId=${encodeURIComponent(projectId)}`;
  }
  return DOCUMENT_CENTER_FALLBACK;
}

function buildPdfTabUrl(pdfPath) {
  const token = getCustomerToken();
  const sep = pdfPath.includes("?") ? "&" : "?";
  return `${pdfPath}${sep}access_token=${encodeURIComponent(token)}`;
}

async function fetchPayload(projectId, kind) {
  const token = getCustomerToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `${API}/projects/${encodeURIComponent(projectId)}/document-view?kind=${encodeURIComponent(kind)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw Object.assign(new Error("書類の読み込みがタイムアウトしました"), { code: "timeout" });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function pdfAuthHeaders() {
  return { Authorization: `Bearer ${getCustomerToken()}` };
}

function getRegenerateUrl() {
  if (receiptMode && payload?.kind === "estimate" && payload?.projectId) {
    return `/api/estimate/v1/projects/${encodeURIComponent(payload.projectId)}/receipt/pdf/regenerate`;
  }
  return payload?.regenerateUrl || null;
}

function buildReceiptPdfUrl() {
  if (!payload?.projectId) return null;
  const params = new URLSearchParams({ includePhotos: "false" });
  const date = $("receipt-date-input")?.value?.trim();
  const proviso = ($("receipt-proviso-input")?.value || DEFAULT_RECEIPT_PROVISO).trim();
  if (date) params.set("receiptDate", date);
  if (proviso) params.set("proviso", proviso);
  return `/api/estimate/v1/projects/${encodeURIComponent(payload.projectId)}/receipt/pdf?${params}`;
}

function resolveActivePdfUrl() {
  if (receiptMode && payload?.kind === "estimate") {
    return buildReceiptPdfUrl();
  }
  return payload?.pdfUrl || null;
}

async function fetchDocumentPdfBlob({ forceRefresh = false } = {}) {
  const pdfUrl = resolveActivePdfUrl();
  if (!pdfUrl) throw new Error("PDF URLがありません");
  if (!forceRefresh && cachedPdfBlob && isValidPdfBlob(cachedPdfBlob)) return cachedPdfBlob;
  // 領収書はクエリ付き GET で都度生成
  const blob = await fetchPdfBlobWithRegenerate({
    fetchUrl: buildPdfTabUrl(pdfUrl),
    headers: pdfAuthHeaders(),
    regenerateUrl: receiptMode ? null : getRegenerateUrl(),
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
  const pdfUrl = resolveActivePdfUrl();
  if (!pdfUrl) throw new Error("PDF URLがありません");
  const blob = await fetchDocumentPdfBlob({ forceRefresh: receiptMode });
  setPdfFrameBlob(blob);
}

function renderEstimateMobile(est, { asReceipt = false } = {}) {
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

  const heroLabel = asReceipt ? "領収金額（税込）" : "御見積金額（税込）";
  const docNoLabel = asReceipt ? "領収番号" : "見積番号";
  const dateLabel = asReceipt ? "領収日" : "発行日";
  const dateValue = asReceipt
    ? $("receipt-date-input")?.value || est.issueDate
    : est.issueDate;
  const proviso = asReceipt
    ? ($("receipt-proviso-input")?.value || DEFAULT_RECEIPT_PROVISO).trim()
    : "";
  const intro = asReceipt
    ? "上記の通り、正に領収いたしました。"
    : "下記の通り、お見積り申し上げます。";
  const stampNote = asReceipt
    ? `<div class="doc-meta-card"><p class="muted">※電子発行につき印紙不要</p></div>`
    : "";

  return `
    <div class="doc-hero-card">
      <p class="doc-hero-label">${heroLabel}</p>
      <p class="doc-hero-amount">${yen(est.total)}</p>
      ${proviso ? `<p class="muted" style="margin:0.35rem 0 0;font-weight:700;">${escapeHtml(proviso)}</p>` : ""}
    </div>
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(est.addressee)}</strong> 様</p>
      <p>${escapeHtml(est.subject)}</p>
      <p class="muted">${intro}</p>
      <p class="muted">${docNoLabel} ${escapeHtml(est.docNo)} · ${dateLabel} ${escapeHtml(dateValue)}</p>
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
    ${stampNote}
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
      html = renderEstimateMobile(data.estimate, { asReceipt: receiptMode });
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

function updateRegenerateButton(_data) {
  const btn = $("btn-regenerate");
  if (!btn) return;
  btn.classList.add("hidden");
}

function updateHeader(data) {
  const label =
    receiptMode && data.kind === "estimate" ? "領収書" : data.label;
  $("header-kind").textContent = label;
  $("header-title").textContent = data.projectTitle;
  document.title = `TiSLY — ${label}`;
  updateRegenerateButton(data);
}

function getShareFileName() {
  if (receiptMode && payload?.kind === "estimate") {
    const base = payload?.shareFileName || "見積書.pdf";
    return String(base).replace(/^見積書/, "領収書").replace(/estimate/i, "receipt");
  }
  return payload?.shareFileName || `${payload?.kind || "document"}.pdf`;
}

function toDateInputValue(displayDate) {
  const raw = String(displayDate || "").trim();
  const m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function setupReceiptModeBar(data, startInReceipt) {
  const bar = $("receipt-mode-bar");
  const toggle = $("btn-receipt-mode");
  const fields = $("receipt-mode-fields");
  if (!bar || !toggle || !fields) return;
  if (data.kind !== "estimate") {
    bar.classList.add("hidden");
    receiptMode = false;
    return;
  }
  bar.classList.remove("hidden");
  const dateInput = $("receipt-date-input");
  const provisoInput = $("receipt-proviso-input");
  if (dateInput && !dateInput.value) {
    dateInput.value = toDateInputValue(data.estimate?.issueDate);
  }
  if (provisoInput && !provisoInput.value) {
    provisoInput.value = DEFAULT_RECEIPT_PROVISO;
  }

  const applyReceiptUi = () => {
    toggle.setAttribute("aria-pressed", receiptMode ? "true" : "false");
    toggle.textContent = receiptMode
      ? "見積書に戻す"
      : "領収書として表示 / 出力";
    fields.classList.toggle("hidden", !receiptMode);
    updateHeader(data);
    renderMobileView(data);
    cachedPdfBlob = null;
    if (viewMode === "pdf") {
      loadPdfFrame().catch((e) => toast(e.message || "PDF更新に失敗しました"));
    }
  };

  receiptMode = Boolean(startInReceipt);
  applyReceiptUi();

  toggle.onclick = () => {
    receiptMode = !receiptMode;
    applyReceiptUi();
  };
  $("btn-receipt-apply")?.addEventListener("click", () => {
    if (!receiptMode) return;
    cachedPdfBlob = null;
    applyReceiptUi();
    toast("領収書内容を反映しました");
  });
}

function prefetchPdfOnTouch() {
  const pdfUrl = resolveActivePdfUrl();
  if (!pdfUrl) return;
  prefetchPdfForShare({
    fetchUrl: buildPdfTabUrl(pdfUrl),
    getHeaders: pdfAuthHeaders,
    regenerateUrl: receiptMode ? null : getRegenerateUrl(),
  })
    .then((blob) => {
      cachedPdfBlob = blob;
    })
    .catch(() => {});
}

async function resolvePdfBlob({ forceRefresh = false } = {}) {
  const pdfUrl = resolveActivePdfUrl();
  if (!pdfUrl) throw new Error("PDFがありません");
  if (!forceRefresh && cachedPdfBlob && isValidPdfBlob(cachedPdfBlob)) return cachedPdfBlob;
  const blob = await fetchDocumentPdfBlob({ forceRefresh });
  cachedPdfBlob = blob;
  return blob;
}

async function handlePdfOpen() {
  if (!resolveActivePdfUrl()) {
    toast("PDFがありません");
    return;
  }
  try {
    await resolvePdfBlob({ forceRefresh: receiptMode });
    await showPdfViewMode();
  } catch (e) {
    toast(e.message || "PDFの取得に失敗しました");
  }
}

async function handleSaveFile() {
  if (!resolveActivePdfUrl()) {
    toast("PDFがありません");
    return;
  }
  const fileName = getShareFileName();
  try {
    const blob = await resolvePdfBlob({ forceRefresh: receiptMode });
    triggerDownload(blob, fileName);
    toast("PDFをファイルに保存しました");
  } catch (e) {
    toast(e.message || "PDFの保存に失敗しました");
  }
}

async function logPdfShare() {
  if (!payload?.projectId) return;
  const fileName = getShareFileName();
  const documentKind =
    receiptMode && payload.kind === "estimate" ? "receipt" : payload.kind || "unknown";
  try {
    await fetch(`${API}/projects/${encodeURIComponent(payload.projectId)}/pdf-share-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getCustomerToken()}`,
      },
      body: JSON.stringify({ documentKind, fileName }),
    });
  } catch {
    /* optional */
  }
}

async function handleShare() {
  if (!resolveActivePdfUrl()) {
    toast("PDFがありません");
    return;
  }
  const fileName = getShareFileName();
  try {
    clearPdfFrame();
    clearBlobUrlsFromPage();
    const pdfBlob = await resolvePdfBlob({ forceRefresh: receiptMode });
    await sharePdfBlobAsFile(pdfBlob, fileName, toast);
    await logPdfShare();
  } catch (e) {
    if (e?.name === "AbortError") return;
    toast(e.message || "共有に失敗しました");
  }
}

async function handlePrint() {
  if (!resolveActivePdfUrl()) {
    toast("PDFがありません");
    return;
  }
  try {
    const blob = await fetchDocumentPdfBlob({ forceRefresh: receiptMode });
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
  navigateBackOne(resolveDocumentReturn(returnUrl, payload?.projectId));
}

async function init() {
  initNavigationStack();
  await requireCustomerLogin(customerCodeFromPath());
  const { kind, projectId, returnUrl, receipt } = parseParams();

  bindPopstateBackGuard(() => handleBack(returnUrl));

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
    setupReceiptModeBar(payload, receipt);
    updateHeader(payload);
    renderMobileView(payload);
    $("doc-loading").classList.add("hidden");
    showPreviewMode();
    applyLayoutMode();
    prefetchPdfOnTouch();
    fetchDocumentPdfBlob({ forceRefresh: receiptMode }).catch(() => {});
  } catch (e) {
    $("doc-loading").classList.add("hidden");
    $("doc-error").classList.remove("hidden");
    $("doc-error").innerHTML = renderFriendlyErrorHtml(e, e.status);
  }
}

init().catch(console.error);
