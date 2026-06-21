import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV2,
  renderCustomerPhotoGalleryV1,
  renderMaterialBadgesV1,
  renderMaterialFilterChipsV1,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function getProjectRef() {
  const params = new URLSearchParams(location.search);
  return params.get("ref") || params.get("projectId") || "DEMO-HOME-001";
}

function renderMaterialCard(item) {
  const badges = renderMaterialBadgesV1(item);
  const preview =
    item.previewUrl && item.type === "photo"
      ? `<img class="customer-material-thumb" src="${escapeHtml(item.previewUrl)}" alt="" loading="lazy" />`
      : `<div class="customer-material-thumb customer-material-thumb-placeholder">${item.type === "video" ? "🎬" : item.type === "pdf" ? "📄" : item.type === "part" ? "🖨" : "📘"}</div>`;
  const href = item.detailUrl?.startsWith("#") ? item.detailUrl : escapeHtml(item.detailUrl);
  const tag = item.detailUrl?.startsWith("#") ? "div" : "a";
  return `<${tag} class="customer-material-card friendly-card" ${tag === "a" ? `href="${href}"` : `id="materials"`}>
    ${preview}
    <div class="customer-material-body">
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.category)}</small>
      ${item.description ? `<p>${escapeHtml(sanitizeCustomerTextV1(item.description))}</p>` : ""}
      <div class="customer-material-badges">${badges}</div>
    </div>
  </${tag}>`;
}

function renderProject(page, projectRef) {
  const caps = (page.capabilities || [])
    .map((c) => `<li>${escapeHtml(sanitizeCustomerTextV1(c))}</li>`)
    .join("");
  const knowledge = (page.relatedKnowledge || [])
    .map(
      (k) =>
        `<a class="customer-related-item" href="${escapeHtml(k.detailUrl)}">${escapeHtml(k.title)}<small>${escapeHtml(k.category)}</small></a>`
    )
    .join("");
  const photos = renderCustomerPhotoGalleryV1(
    (page.relatedPhotos || [])
      .filter((p) => p.previewUrl)
      .map((p) => ({ previewUrl: p.previewUrl, label: p.label }))
  );
  const pdfs = (page.relatedPdfs || [])
    .filter((p) => p.viewUrl)
    .map(
      (pdf) =>
        `<a class="customer-pdf-btn" href="${escapeHtml(pdf.viewUrl)}" target="_blank" rel="noopener">📄 ${escapeHtml(pdf.label)}</a>`
    )
    .join("");
  const materials = (page.materials || []).map(renderMaterialCard).join("");

  return `
    <header class="customer-project-hero friendly-card">
      <p class="customer-project-genre">${escapeHtml(page.workGenre)}</p>
      <h1>${escapeHtml(page.propertyName)}</h1>
      <p class="customer-project-intro">${escapeHtml(sanitizeCustomerTextV1(page.customerExplanation))}</p>
      <div class="customer-project-actions">
        <a class="customer-action-btn primary" href="${escapeHtml(page.siteMapUrl)}">🗺 Site Mapを見る</a>
        <a class="customer-action-btn" href="#materials-section">📚 資料一覧を見る</a>
      </div>
    </header>
    ${photos}
    ${renderSection("工事でできること", caps ? `<ul>${caps}</ul>` : "")}
    ${knowledge ? renderSection("関連ナレッジ", knowledge) : ""}
    ${pdfs ? renderSection("関連PDF", pdfs) : ""}
    <section class="customer-card" id="materials-section">
      <h2>${escapeHtml(page.materialsSectionLabel || "資料一覧")}</h2>
      <div class="customer-filter-row" id="material-filter-row">${renderMaterialFilterChipsV1("all")}</div>
      <div class="customer-material-list" id="material-list">${materials || '<p class="status-muted">資料は準備中です</p>'}</div>
    </section>
    <div class="customer-field-link-row">
      <a href="${escapeHtml(page.customerHomeV2Url)}">← ホームへ</a>
    </div>
  `;
}

function renderSection(title, inner) {
  if (!inner) return "";
  return `<section class="customer-card"><h2>${escapeHtml(title)}</h2>${inner}</section>`;
}

async function filterMaterials(filter) {
  const projectRef = getProjectRef();
  const token = getCustomerToken();
  const qs = new URLSearchParams({ projectId: projectRef, filter });
  const res = await fetch(`/api/knowledge/customer-materials-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return;
  const mount = $("material-list");
  if (!mount) return;
  mount.innerHTML = data.materials?.length
    ? data.materials.map(renderMaterialCard).join("")
    : '<p class="status-muted">該当する資料がありません</p>';
  document.querySelectorAll(".customer-filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.getAttribute("data-filter") === filter);
  });
}

function bindEvents(page, projectRef) {
  $("material-filter-row")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".customer-filter-chip");
    if (!chip) return;
    filterMaterials(chip.getAttribute("data-filter") || "all");
  });
}

async function loadProject() {
  const projectRef = getProjectRef();
  const token = getCustomerToken();
  const qs = new URLSearchParams({ projectId: projectRef });
  const res = await fetch(`/api/knowledge/customer-project-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-project-root").innerHTML = `<p class="status-muted">${escapeHtml(data.error || "読み込み失敗")}</p>`;
    return;
  }
  $("customer-project-root").innerHTML = renderProject(data.page, projectRef);
  document.title = `TiSLY — ${data.page.propertyName}`;
  $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV2("project", { projectRef });
  bindEvents(data.page, projectRef);
}

async function init() {
  await requireCustomerLogin();
  await loadProject();
}

init();
