import { getCustomerToken, requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

const MOBILE_BREAKPOINT = 768;
const API = "/api/estimate/v1";

const $ = (id) => document.getElementById(id);

let payload = null;
let lightboxPhotos = [];
let lightboxIndex = 0;
let pdfBlobUrl = null;
let mobileMode = false;

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
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

async function loadPdfFrame(pdfPath) {
  const token = getCustomerToken();
  const res = await fetch(pdfPath, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("PDFの読み込みに失敗しました");
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html; charset=UTF-8" });
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = URL.createObjectURL(blob);
    $("pdf-frame").src = pdfBlobUrl;
    return;
  }
  const blob = await res.blob();
  if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  pdfBlobUrl = URL.createObjectURL(blob);
  $("pdf-frame").src = pdfBlobUrl;
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

function renderPhotoList(photos, { swipe = false } = {}) {
  if (!photos.length) {
    return `<div class="doc-meta-card"><p class="muted">写真はありません</p></div>`;
  }
  lightboxPhotos = photos;

  if (swipe) {
    const slides = photos
      .map(
        (p, i) => `<div class="doc-swipe-slide" data-index="${i}">
          <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.title)}" loading="lazy" />
        </div>`
      )
      .join("");
    const dots = photos
      .map((_, i) => `<span class="doc-swipe-dot${i === 0 ? " active" : ""}" data-index="${i}"></span>`)
      .join("");
    return `<div class="doc-swipe-gallery" id="swipe-gallery">
      <div class="doc-swipe-track" id="swipe-track">${slides}</div>
      <p class="doc-photo-caption" id="swipe-caption">${escapeHtml(photos[0].title)}</p>
      <div class="doc-swipe-dots" id="swipe-dots">${dots}</div>
    </div>`;
  }

  return `<div class="doc-photo-list">
    ${photos
      .map(
        (p, i) => `<figure class="doc-photo-item" data-photo-index="${i}" role="button" tabindex="0">
          <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.title)}" loading="lazy" />
          <figcaption class="doc-photo-caption">${escapeHtml(p.title)}</figcaption>
        </figure>`
      )
      .join("")}
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
    ${renderPhotoList(spec.photos)}`;
}

function renderCompletionMobile(cr) {
  const checklistHtml = cr.checklist.length
    ? cr.checklist
        .map(
          (it) => `<article class="doc-check-card ${it.checked ? "done" : "pending"}">
            <span class="doc-check-icon">${it.checked ? "☑" : "□"}</span>
            <div class="doc-check-body">
              <p class="doc-check-cat">${escapeHtml(it.category)}</p>
              <p class="doc-check-label">${escapeHtml(it.label)}</p>
            </div>
          </article>`
        )
        .join("")
    : `<div class="doc-meta-card"><p class="muted">チェック項目はありません</p></div>`;

  const timeBlock =
    cr.startTime || cr.endTime
      ? `<div class="doc-hero-card doc-work-time-hero">
          <p class="doc-hero-label">作業時間</p>
          <p class="time-range">${escapeHtml(cr.startTime || "—")} 〜 ${escapeHtml(cr.endTime || "—")}</p>
          ${cr.staffName ? `<p class="muted">作業員 ${escapeHtml(cr.staffName)}</p>` : ""}
        </div>`
      : "";

  return `
    ${timeBlock}
    <div class="doc-meta-card">
      <p><strong>${escapeHtml(cr.addressee)}</strong> 様</p>
      <p>${escapeHtml(cr.subject)}</p>
      <p class="muted">${escapeHtml(cr.workLocation || cr.siteName)}</p>
    </div>
    ${cr.workContent ? `<div class="doc-meta-card"><p class="muted">作業内容</p><p>${escapeHtml(cr.workContent)}</p></div>` : ""}
    <p class="section-label" style="margin:0.5rem 0 0;">チェック項目</p>
    ${checklistHtml}
    <p class="section-label" style="margin:0.75rem 0 0;">写真</p>
    ${renderPhotoList(cr.photos, { swipe: true })}`;
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

  const gallery = $("swipe-gallery");
  if (gallery) {
    bindSwipeGallery(gallery);
  }
}

function bindSwipeGallery(gallery) {
  const track = $("swipe-track");
  const dots = $("swipe-dots");
  const caption = $("swipe-caption");
  let index = 0;
  let startX = 0;
  let dragging = false;

  function goTo(i) {
    index = Math.max(0, Math.min(lightboxPhotos.length - 1, i));
    track.style.transform = `translateX(-${index * 100}%)`;
    dots?.querySelectorAll(".doc-swipe-dot").forEach((d, di) => {
      d.classList.toggle("active", di === index);
    });
    if (caption && lightboxPhotos[index]) {
      caption.textContent = lightboxPhotos[index].title;
    }
  }

  gallery.addEventListener("click", () => openLightbox(index));

  gallery.addEventListener(
    "touchstart",
    (ev) => {
      startX = ev.touches[0].clientX;
      dragging = true;
    },
    { passive: true }
  );

  gallery.addEventListener(
    "touchend",
    (ev) => {
      if (!dragging) return;
      dragging = false;
      const dx = ev.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40) return;
      goTo(dx < 0 ? index + 1 : index - 1);
    },
    { passive: true }
  );

  dots?.querySelectorAll(".doc-swipe-dot").forEach((dot) => {
    dot.addEventListener("click", (ev) => {
      ev.stopPropagation();
      goTo(Number(dot.dataset.index || 0));
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

function applyLayoutMode() {
  mobileMode = isMobileViewport();
  $("doc-mobile").classList.toggle("hidden", !mobileMode);
  $("doc-desktop").classList.toggle("hidden", mobileMode);
  const showFixedTotal = mobileMode && (payload?.estimate || payload?.invoice);
  $("doc-fixed-total").classList.toggle("hidden", !showFixedTotal);
  if (!mobileMode && payload) {
    loadPdfFrame(payload.pdfUrl).catch((e) => {
      $("doc-error").classList.remove("hidden");
      $("doc-error").innerHTML = renderFriendlyErrorHtml(e);
    });
  }
}

function updateHeader(data) {
  $("header-kind").textContent = data.label;
  $("header-title").textContent = data.projectTitle;
  document.title = `TiSLY — ${data.label}`;
}

async function handleShare() {
  const url = window.location.href;
  const title = `${payload?.label || "書類"} — ${payload?.projectTitle || ""}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      /* cancelled */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("リンクをコピーしました");
  } catch {
    toast("共有に失敗しました");
  }
}

function handlePrint() {
  if (mobileMode) {
    window.print();
    return;
  }
  const frame = $("pdf-frame");
  try {
    frame.contentWindow?.print();
  } catch {
    window.open(buildPdfTabUrl(payload.pdfUrl), "_blank");
  }
}

function handleBack(returnUrl) {
  if (returnUrl && returnUrl.startsWith("/")) {
    window.location.href = returnUrl;
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
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
  $("btn-share").addEventListener("click", () => handleShare());
  $("btn-print").addEventListener("click", () => handlePrint());
  $("btn-pdf").addEventListener("click", () => {
    window.open(buildPdfTabUrl(payload?.pdfUrl || ""), "_blank", "noopener");
  });

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
    const wasMobile = mobileMode;
    applyLayoutMode();
    if (!wasMobile && mobileMode && payload) {
      renderMobileView(payload);
    }
  });

  try {
    payload = await fetchPayload(projectId, kind);
    updateHeader(payload);
    renderMobileView(payload);
    $("doc-loading").classList.add("hidden");
    applyLayoutMode();
  } catch (e) {
    $("doc-loading").classList.add("hidden");
    $("doc-error").classList.remove("hidden");
    $("doc-error").innerHTML = renderFriendlyErrorHtml(e, e.status);
  }
}

init().catch(console.error);
