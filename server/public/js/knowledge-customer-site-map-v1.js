import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV2,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function getProjectRef() {
  const params = new URLSearchParams(location.search);
  return params.get("ref") || params.get("projectId") || "DEMO-HOME-001";
}

function renderAreaCard(area) {
  return `<button type="button" class="customer-sitemap-area friendly-card" data-area-id="${escapeHtml(area.areaId)}">
    <div class="customer-sitemap-area-icon">${escapeHtml(area.icon)}</div>
    <strong>${escapeHtml(area.areaName)}</strong>
    <div class="customer-sitemap-meta">
      <span>設備 ${area.equipmentCount}</span>
      <span>資料 ${area.knowledgeCount}</span>
    </div>
    <span class="customer-sitemap-status">${escapeHtml(area.statusLabel)}</span>
  </button>`;
}

function renderAreaDetail(area, links, projectRef) {
  const knowledge = links
    .map(
      (k) =>
        `<a class="customer-related-item" href="${escapeHtml(k.detailUrl)}">${escapeHtml(k.title)}<small>詳細を見る</small></a>`
    )
    .join("");
  const photoIds = (area.relatedPhotoIds || [])
    .map((id) => `<span class="customer-site-chip">📷 ${escapeHtml(id.replace(/-/g, " "))}</span>`)
    .join("");
  const pdfIds = (area.relatedPdfIds || [])
    .map((id) => `<span class="customer-site-chip">📄 ${escapeHtml(id.replace(/-/g, " "))}</span>`)
    .join("");

  return `
    <section class="customer-card customer-sitemap-detail" id="area-detail">
      <h2>${escapeHtml(area.areaName)}</h2>
      <p>${escapeHtml(sanitizeCustomerTextV1(area.description))}</p>
      <div class="customer-sitemap-status-badge">${escapeHtml(area.statusLabel)}</div>
      ${renderSubSection("お客様向け説明", area.customerExplanation)}
      ${photoIds ? renderSubSection("関連写真", `<div class="customer-site-locations">${photoIds}</div>`) : ""}
      ${pdfIds ? renderSubSection("関連資料", `<div class="customer-site-locations">${pdfIds}</div>`) : ""}
      ${knowledge ? renderSubSection("該当ナレッジ", knowledge) : ""}
      <a class="customer-action-btn" href="/knowledge-customer-project-v1?ref=${encodeURIComponent(projectRef)}">← 物件ページへ</a>
    </section>
  `;
}

function renderSubSection(title, inner) {
  if (!inner) return "";
  return `<div class="customer-sitemap-sub"><h3>${escapeHtml(title)}</h3>${typeof inner === "string" && inner.startsWith("<") ? inner : `<p>${escapeHtml(sanitizeCustomerTextV1(inner))}</p>`}</div>`;
}

function renderSiteMap(siteMap, projectRef) {
  const areas = (siteMap.areas || []).map(renderAreaCard).join("");
  return `
    <header class="customer-project-hero friendly-card">
      <p class="customer-project-genre">${escapeHtml(siteMap.workGenre)}</p>
      <h1>${escapeHtml(siteMap.propertyName)}</h1>
      <p class="customer-project-intro">エリアをタップすると、関連する資料と説明が表示されます。</p>
    </header>
    <h2 class="customer-section-title">配置図（2D）</h2>
    <div class="customer-sitemap-grid">${areas}</div>
    <div id="area-detail-mount"></div>
    <div class="customer-field-link-row">
      <a href="${escapeHtml(siteMap.projectPageUrl)}">← 物件ページへ</a>
      <a href="${escapeHtml(siteMap.customerHomeV2Url)}">ホームへ</a>
    </div>
  `;
}

async function loadAreaDetail(areaId, projectRef) {
  const token = getCustomerToken();
  const qs = new URLSearchParams({ projectId: projectRef, areaId });
  const res = await fetch(`/api/knowledge/customer-site-map-v1/area?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return;
  const mount = $("area-detail-mount");
  if (!mount) return;
  mount.innerHTML = renderAreaDetail(data.area, data.knowledgeLinks || [], projectRef);
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
  const token = getCustomerToken();
  const qs = new URLSearchParams({ projectId: projectRef });
  const res = await fetch(`/api/knowledge/customer-site-map-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-sitemap-root").innerHTML = `<p class="status-muted">${escapeHtml(data.error || "読み込み失敗")}</p>`;
    return;
  }
  $("customer-sitemap-root").innerHTML = renderSiteMap(data.siteMap, projectRef);
  document.title = `TiSLY — ${data.siteMap.propertyName} 配置図`;
  $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV2("sitemap", { projectRef });
  bindSiteMapEvents(projectRef);
}

async function init() {
  await requireCustomerLogin();
  await loadSiteMap();
}

init();
