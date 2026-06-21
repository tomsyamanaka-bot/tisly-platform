/** Knowledge Customer UI V3 — 案件ページ */

import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV3,
  renderCustomerPhotoGalleryV1,
  renderCustomerPhotoModalV1,
  renderMaterialBadgesV1,
  renderMaterialFilterChipsV1,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function getProjectRef() {
  const params = new URLSearchParams(location.search);
  return params.get("ref") || params.get("projectId") || "DEMO-HOME-001";
}

function renderPhotoSection(title, photos, sectionClass) {
  if (!photos?.length) {
    return `<div class="customer-photo-section ${sectionClass}">
      <h3>${escapeHtml(title)}</h3>
      <div class="customer-photo-placeholder friendly-card">
        <span class="customer-photo-placeholder-icon">📷</span>
        <p>写真は準備中です</p>
      </div>
    </div>`;
  }

  const cards = photos
    .map(
      (p) => `<button type="button" class="customer-photo-card-v3 friendly-card" data-photo-url="${escapeHtml(p.previewUrl || p.openUrl || "")}" data-photo-label="${escapeHtml(p.safeLabel || p.title)}">
      ${
        p.previewUrl
          ? `<img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.safeLabel || p.title)}" loading="lazy" />`
          : `<div class="customer-photo-card-placeholder">📷</div>`
      }
      <span class="customer-photo-card-label">${escapeHtml(p.safeLabel || p.title)}</span>
    </button>`
    )
    .join("");

  return `<div class="customer-photo-section ${sectionClass}">
    <h3>${escapeHtml(title)}</h3>
    <div class="customer-photo-grid-v3">${cards}</div>
  </div>`;
}

function renderPhotoSections(page) {
  const sections = page.photoSections;
  if (!sections) {
    return renderCustomerPhotoGalleryV1(
      (page.relatedPhotos || [])
        .filter((p) => p.previewUrl)
        .map((p) => ({ previewUrl: p.previewUrl, label: p.label }))
    );
  }

  return `<section class="customer-card customer-photos-v3" id="photos-section">
    <h2>現場写真</h2>
    ${page.preparingMessage ? `<p class="customer-preparing-note">${escapeHtml(page.preparingMessage)}</p>` : ""}
    ${renderPhotoSection("施工前", sections.before, "before")}
    ${renderPhotoSection("施工中", sections.during, "during")}
    ${renderPhotoSection("施工後", sections.after, "after")}
    ${renderPhotoSection("現場メモ", sections.memo, "memo")}
  </section>`;
}

function renderPdfGroup(title, items) {
  if (!items?.length) return "";
  const buttons = items
    .map(
      (pdf) =>
        `<a class="customer-pdf-btn-v3" href="${escapeHtml(pdf.openUrl || "#")}" target="_blank" rel="noopener">
          <span class="customer-pdf-btn-icon">📄</span>
          <span class="customer-pdf-btn-text">
            <strong>${escapeHtml(pdf.safeLabel || pdf.title)}</strong>
            <small>${escapeHtml(pdf.viewLabel || "PDFを見る")}</small>
          </span>
        </a>`
    )
    .join("");
  return `<div class="customer-pdf-group"><h3>${escapeHtml(title)}</h3>${buttons}</div>`;
}

function renderPdfSections(page) {
  const pdf = page.pdfSections;
  if (!pdf) {
    const legacy = (page.relatedPdfs || [])
      .filter((p) => p.viewUrl)
      .map(
        (p) =>
          `<a class="customer-pdf-btn-v3" href="${escapeHtml(p.viewUrl)}" target="_blank" rel="noopener">
            <span class="customer-pdf-btn-icon">📄</span>
            <span class="customer-pdf-btn-text"><strong>${escapeHtml(p.label)}</strong><small>PDFを見る</small></span>
          </a>`
      )
      .join("");
    return legacy ? `<section class="customer-card"><h2>PDF資料</h2>${legacy}</section>` : "";
  }

  const inner = [
    renderPdfGroup("仕様書", pdf.specification),
    renderPdfGroup("完了報告書", pdf.completion),
    renderPdfGroup("見積書", pdf.estimate),
    renderPdfGroup("請求書", pdf.invoice),
    renderPdfGroup("取扱説明", pdf.manual),
    renderPdfGroup("部品資料", pdf.parts),
  ]
    .filter(Boolean)
    .join("");

  if (!inner) {
    return `<section class="customer-card customer-pdfs-v3" id="pdfs-section">
      <h2>PDF資料</h2>
      <p class="status-muted">資料を準備中です。順次追加しております。</p>
    </section>`;
  }

  return `<section class="customer-card customer-pdfs-v3" id="pdfs-section">
    <h2>PDF資料</h2>
    ${inner}
  </section>`;
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
  const materials = (page.materials || []).map(renderMaterialCard).join("");
  const title = page.customerSafeTitle || page.propertyName;
  const statusBadge = page.statusLabel
    ? `<span class="customer-status-badge">${escapeHtml(page.statusLabel)}</span>`
    : "";

  return `
    <header class="customer-project-hero friendly-card">
      <p class="customer-project-genre">${escapeHtml(page.workGenre)}</p>
      <h1>${escapeHtml(title)}</h1>
      ${statusBadge}
      ${page.visitDateLabel ? `<p class="customer-visit-date">${escapeHtml(page.visitDateLabel)}</p>` : ""}
      <p class="customer-project-intro">${escapeHtml(sanitizeCustomerTextV1(page.customerExplanation))}</p>
      <div class="customer-project-actions">
        <a class="customer-action-btn primary" href="${escapeHtml(page.siteMapUrl)}">🗺 配置図を見る</a>
        <a class="customer-action-btn" href="#photos-section">📷 現場写真</a>
        <a class="customer-action-btn" href="#pdfs-section">📄 資料を見る</a>
      </div>
    </header>
    ${renderPhotoSections(page)}
    ${renderSection("工事でできること", caps ? `<ul>${caps}</ul>` : "")}
    ${knowledge ? renderSection("関連ナレッジ", knowledge) : ""}
    ${renderPdfSections(page)}
    <section class="customer-card" id="materials-section">
      <h2>${escapeHtml(page.materialsSectionLabel || "資料一覧")}</h2>
      <div class="customer-filter-row" id="material-filter-row">${renderMaterialFilterChipsV1("all")}</div>
      <div class="customer-material-list" id="material-list">${materials || '<p class="status-muted">資料は準備中です</p>'}</div>
    </section>
    <div class="customer-field-link-row">
      <a href="${escapeHtml(page.customerHomeV2Url)}">← ホームへ</a>
    </div>
    ${renderCustomerPhotoModalV1()}
  `;
}

function renderSection(title, inner) {
  if (!inner) return "";
  return `<section class="customer-card"><h2>${escapeHtml(title)}</h2>${inner}</section>`;
}

async function filterMaterials(filter) {
  const projectRef = getProjectRef();
  const token = getCustomerToken();
  const qs = new URLSearchParams({ ref: projectRef, filter });
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

function bindPhotoModal() {
  const modal = $("customer-photo-modal");
  const modalImg = $("customer-photo-modal-img");
  const modalLabel = $("customer-photo-modal-label");
  if (!modal || !modalImg) return;

  document.querySelectorAll(".customer-photo-card-v3").forEach((btn) => {
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

  modal.querySelector(".customer-photo-modal-backdrop")?.addEventListener("click", () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modalImg.src = "";
  });
  modal.querySelector(".customer-photo-modal-close")?.addEventListener("click", () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modalImg.src = "";
  });
}

function bindEvents() {
  $("material-filter-row")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".customer-filter-chip");
    if (!chip) return;
    filterMaterials(chip.getAttribute("data-filter") || "all");
  });
  bindPhotoModal();
}

async function loadProject() {
  const projectRef = getProjectRef();
  const token = getCustomerToken();
  const qs = new URLSearchParams({ ref: projectRef });
  const res = await fetch(`/api/knowledge/customer-project-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-project-root").innerHTML = `<div class="customer-card friendly-card"><p class="status-muted">資料を準備中です。しばらくしてから再度お試しください。</p></div>`;
    $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV3("project", { projectRef });
    return;
  }
  const page = data.page;
  $("customer-project-root").innerHTML = renderProject(page, projectRef);
  document.title = `TiSLY — ${page.customerSafeTitle || page.propertyName}`;
  $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV3("project", { projectRef });
  bindEvents();
}

async function init() {
  await requireCustomerLogin();
  await loadProject();
}

init();
