/** Knowledge Customer UI V4 — 案件一覧 */

import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV3,
  renderCustomerProjectListFiltersV4,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function getInitialFilter() {
  return new URLSearchParams(location.search).get("filter") || "all";
}

function renderProjectCard(project) {
  const badges = [];
  if (project.hasPhotos) badges.push("📷 写真あり");
  if (project.hasPdfs) badges.push("📄 PDFあり");
  if (project.hasSiteMap) badges.push("🗺 配置図あり");

  return `<a class="customer-project-card-v4 friendly-card" href="${escapeHtml(project.pageUrl)}">
    <div class="customer-project-card-head">
      <span class="customer-project-card-icon">${escapeHtml(project.icon || "📋")}</span>
      <div>
        <strong>${escapeHtml(sanitizeCustomerTextV1(project.propertyName))}</strong>
        <small>${escapeHtml(project.city)} · ${escapeHtml(project.workGenre)}</small>
      </div>
    </div>
    <div class="customer-project-card-meta">
      <span class="customer-status-badge">${escapeHtml(project.status)}</span>
      ${badges.map((b) => `<span class="customer-project-chip">${escapeHtml(b)}</span>`).join("")}
    </div>
  </a>`;
}

function renderPage(data, filter) {
  const projects = data.projects || [];
  return `
    <header class="customer-card friendly-card">
      <h1>最近の案件</h1>
      <p class="status-muted">お客様向けに安全な情報だけを表示しています。</p>
    </header>
    <div class="customer-search-row">
      <input id="customer-projects-search" class="customer-search-input-v4" type="search" placeholder="市区町村・工事内容で検索" value="${escapeHtml(data.query || "")}" />
    </div>
    <div id="customer-projects-filter-row">${renderCustomerProjectListFiltersV4(filter)}</div>
    <section class="customer-card">
      ${projects.length ? projects.map(renderProjectCard).join("") : '<p class="status-muted">該当する案件がありません</p>'}
    </section>
    <div class="customer-field-link-row">
      <a href="/knowledge-customer-v2">← お客様ホームへ</a>
    </div>
  `;
}

async function loadProjects(filter = "all", query = "") {
  const token = getCustomerToken();
  const qs = new URLSearchParams();
  if (filter && filter !== "all") qs.set("filter", filter);
  if (query) qs.set("q", query);
  const res = await fetch(`/api/knowledge/customer-projects-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-projects-root").innerHTML =
      '<div class="customer-card friendly-card"><p class="status-muted">案件一覧を読み込めませんでした。</p></div>';
    return;
  }
  $("customer-projects-root").innerHTML = renderPage(data, filter);
  $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV3("projects");
  bindEvents(filter);
}

function bindEvents(activeFilter) {
  $("customer-projects-filter-row")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".customer-filter-chip");
    if (!chip) return;
    const filter = chip.getAttribute("data-filter") || "all";
    const query = $("customer-projects-search")?.value?.trim() || "";
    loadProjects(filter, query);
  });

  $("customer-projects-search")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const query = e.target.value.trim();
    loadProjects(activeFilter, query);
  });
}

async function init() {
  await requireCustomerLogin();
  await loadProjects(getInitialFilter());
}

init();
