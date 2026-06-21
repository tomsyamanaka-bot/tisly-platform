/** Knowledge Customer UI V3 — Site Map */

import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV3,
  renderCustomerBottomNavShareV1,
  renderCustomerPhotoModalV1,
  sanitizeCustomerTextV1,
  isShareViewV1,
  appendShareViewQuery,
  bindCustomerShareCloseV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function getProjectRef() {
  const params = new URLSearchParams(location.search);
  return params.get("ref") || params.get("projectId") || "DEMO-HOME-001";
}

function renderAreaCard(area) {
  const photoCount = (area.relatedPhotoIds || []).length;
  const pdfCount = (area.relatedPdfIds || []).length;
  return `<button type="button" class="customer-sitemap-area friendly-card" data-area-id="${escapeHtml(area.areaId)}">
    <div class="customer-sitemap-area-icon">${escapeHtml(area.icon)}</div>
    <strong>${escapeHtml(area.areaName)}</strong>
    <div class="customer-sitemap-meta">
      <span>設備 ${area.equipmentCount}</span>
      <span>写真 ${photoCount}</span>
      <span>資料 ${pdfCount + area.knowledgeCount}</span>
    </div>
    <span class="customer-sitemap-status">${escapeHtml(area.statusLabel)}</span>
  </button>`;
}

function renderBeforeAfter(beforePoints, afterPoints) {
  if (!beforePoints?.length && !afterPoints?.length) return "";
  const before = (beforePoints || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  const after = (afterPoints || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  return `<div class="customer-before-after-v2">
    <div class="customer-ba-column before"><h3>Before</h3><ul>${before}</ul></div>
    <div class="customer-ba-column after"><h3>After</h3><ul>${after}</ul></div>
  </div>`;
}

function renderAreaPhotos(photos) {
  if (!photos?.length) {
    return `<p class="status-muted">関連写真は準備中です</p>`;
  }
  return `<div class="customer-sitemap-photo-grid">${photos
    .map(
      (p) =>
        `<button type="button" class="customer-sitemap-photo-card" data-photo-url="${escapeHtml(p.previewUrl || p.openUrl || "")}" data-photo-label="${escapeHtml(p.safeLabel)}">
          ${
            p.previewUrl
              ? `<img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.safeLabel)}" loading="lazy" />`
              : `<div class="customer-photo-card-placeholder">📷</div>`
          }
          <span>${escapeHtml(p.safeLabel)}</span>
        </button>`
    )
    .join("")}</div>`;
}

function renderAreaPdfs(pdfs) {
  if (!pdfs?.length) return "";
  return pdfs
    .map(
      (pdf) =>
        `<a class="customer-pdf-btn-v3 customer-pdf-btn-v4" href="${escapeHtml(pdf.openUrl || "#")}">
          <span class="customer-pdf-btn-icon">📄</span>
          <span class="customer-pdf-btn-text"><strong>${escapeHtml(pdf.safeLabel)}</strong><small>${escapeHtml(pdf.viewLabel || "PDFを見る")}</small></span>
        </a>`
    )
    .join("");
}

function renderAreaDetail(area, data, projectRef, shareView) {
  const knowledge = shareView
    ? ""
    : (data.knowledgeLinks || [])
        .map(
          (k) =>
            `<a class="customer-related-item" href="${escapeHtml(k.detailUrl)}">${escapeHtml(k.title)}<small>詳細を見る</small></a>`
        )
        .join("");

  const warnings = (data.customerWarnings || [])
    .map((w) => `<li>${escapeHtml(sanitizeCustomerTextV1(w))}</li>`)
    .join("");

  return `
    <section class="customer-card customer-sitemap-detail" id="area-detail">
      <h2>${escapeHtml(area.areaName)}</h2>
      <p>${escapeHtml(sanitizeCustomerTextV1(area.description))}</p>
      <div class="customer-sitemap-status-badge">${escapeHtml(area.statusLabel)}</div>
      ${renderSubSection("お客様向け説明", area.customerExplanation)}
      ${renderSubSection("関連写真", renderAreaPhotos(data.relatedPhotos || []))}
      ${renderSubSection("関連資料", renderAreaPdfs(data.relatedPdfs || []))}
      ${renderSubSection("Before / After", renderBeforeAfter(data.beforePoints, data.afterPoints))}
      ${knowledge ? renderSubSection("該当ナレッジ", knowledge) : ""}
      ${warnings ? renderSubSection("注意点", `<ul class="customer-warnings-list">${warnings}</ul>`) : ""}
      <a class="customer-action-btn" href="${escapeHtml(appendShareViewQuery(`/knowledge-customer-project-v1?ref=${encodeURIComponent(projectRef)}`))}">← 物件ページへ</a>
    </section>
  `;
}

function renderSubSection(title, inner) {
  if (!inner) return "";
  return `<div class="customer-sitemap-sub"><h3>${escapeHtml(title)}</h3>${typeof inner === "string" && inner.startsWith("<") ? inner : `<p>${escapeHtml(sanitizeCustomerTextV1(inner))}</p>`}</div>`;
}

function renderSiteMap(siteMap, projectRef, shareView) {
  const areas = (siteMap.areas || []).map(renderAreaCard).join("");
  const title = siteMap.customerSafeTitle || siteMap.propertyName;
  const mapAsset = siteMap.mapAsset;
  const integrationNote = mapAsset
    ? `<p class="customer-sitemap-integration-note"><strong>${escapeHtml(mapAsset.integrationStatusLabel || "図面連携準備中")}</strong><br />${escapeHtml(sanitizeCustomerTextV1(mapAsset.integrationNote || ""))}</p>`
    : "";
  return `
    ${shareView ? '<p class="customer-share-banner">お客様共有モード — 閲覧専用です</p>' : ""}
    <header class="customer-project-hero friendly-card">
      <p class="customer-project-genre">${escapeHtml(siteMap.workGenre)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="customer-project-intro">エリアをタップすると、関連する写真・資料・説明が表示されます。</p>
      ${siteMap.preparingMessage ? `<p class="customer-preparing-note">${escapeHtml(siteMap.preparingMessage)}</p>` : ""}
    </header>
    ${integrationNote}
    <h2 class="customer-section-title">配置図（2D）</h2>
    <div class="customer-sitemap-grid">${areas}</div>
    <div id="area-detail-mount"></div>
    ${
      shareView
        ? ""
        : `<div class="customer-field-link-row">
      <a href="${escapeHtml(siteMap.projectPageUrl)}">← 物件ページへ</a>
      ${siteMap.customerHomeV2Url ? `<a href="${escapeHtml(siteMap.customerHomeV2Url)}">ホームへ</a>` : ""}
    </div>`
    }
    ${renderCustomerPhotoModalV1()}
  `;
}

function bindPhotoModal() {
  const modal = $("customer-photo-modal");
  const modalImg = $("customer-photo-modal-img");
  const modalLabel = $("customer-photo-modal-label");
  if (!modal || !modalImg) return;

  document.querySelectorAll(".customer-sitemap-photo-card, .customer-photo-card-v3").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-photo-url");
      if (!url) return;
      modalImg.src = url;
      modalImg.alt = btn.getAttribute("data-photo-label") || "写真";
      if (modalLabel) modalLabel.textContent = btn.getAttribute("data-photo-label") || "";
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    });
  });

  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modalImg.src = "";
  };
  modal.querySelector(".customer-photo-modal-backdrop")?.addEventListener("click", close);
  modal.querySelector(".customer-photo-modal-close")?.addEventListener("click", close);
}

async function loadAreaDetail(areaId, projectRef) {
  const token = getCustomerToken();
  const qs = new URLSearchParams({ ref: projectRef, areaId });
  if (isShareViewV1()) qs.set("view", "share");
  const res = await fetch(`/api/knowledge/customer-site-map-v1/area?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  const mount = $("area-detail-mount");
  if (!mount) return;

  if (!data.area) {
    mount.innerHTML = `<section class="customer-card"><p class="status-muted">${escapeHtml(data.preparingMessage || "このエリアの資料を準備中です")}</p></section>`;
    return;
  }

  mount.innerHTML = renderAreaDetail(data.area, data, projectRef, isShareViewV1());
  bindPhotoModal();
  mount.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function bindSiteMapEvents(projectRef) {
  document.querySelector(".customer-sitemap-grid")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".customer-sitemap-area");
    if (!btn) return;
    document.querySelectorAll(".customer-sitemap-area").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    loadAreaDetail(btn.getAttribute("data-area-id"), projectRef);
  });
}

async function loadSiteMap() {
  const projectRef = getProjectRef();
  const shareView = isShareViewV1();
  const token = getCustomerToken();
  const qs = new URLSearchParams({ ref: projectRef });
  if (shareView) qs.set("view", "share");
  const res = await fetch(`/api/knowledge/customer-site-map-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-sitemap-root").innerHTML = `<div class="customer-card"><p class="status-muted">配置図を準備中です。しばらくしてから再度お試しください。</p></div>`;
    $("customer-bottom-nav-mount").innerHTML = shareView
      ? renderCustomerBottomNavShareV1({ projectPageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(projectRef)}&view=share` })
      : renderCustomerBottomNavV3("sitemap", { projectRef });
    if (shareView) bindCustomerShareCloseV1();
    return;
  }
  const siteMap = data.siteMap;
  $("customer-sitemap-root").innerHTML = renderSiteMap(siteMap, projectRef, shareView || siteMap.isShareView);
  document.title = `TiSLY — ${siteMap.customerSafeTitle || siteMap.propertyName} 配置図`;
  if (shareView || siteMap.isShareView) {
    $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavShareV1({
      projectPageUrl: siteMap.projectPageUrl,
      closeUrl: siteMap.projectPageUrl,
    });
    bindCustomerShareCloseV1();
  } else {
    $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV3("sitemap", { projectRef });
  }
  bindSiteMapEvents(projectRef);
}

async function init() {
  await requireCustomerLogin();
  await loadSiteMap();
}

init();
