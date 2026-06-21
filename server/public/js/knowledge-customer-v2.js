import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV2,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function renderProjectCard(p) {
  return `<a class="customer-project-card friendly-card" href="${escapeHtml(p.pageUrl)}">
    <div class="customer-project-card-icon">${escapeHtml(p.icon)}</div>
    <strong>${escapeHtml(p.propertyName)}</strong>
    <small>${escapeHtml(p.workGenre)}</small>
    <span class="customer-project-card-cta">物件の説明を見る →</span>
  </a>`;
}

function renderCategoryCard(cat) {
  return `<a class="customer-category-card" href="/knowledge-customer-detail-v1?id=PLC-SELF-HOLD-001&kind=plc">
    <div class="customer-category-icon">${escapeHtml(cat.icon)}</div>
    <strong>${escapeHtml(cat.label)}</strong>
    <small>${escapeHtml(cat.description)}</small>
    <span class="customer-category-count">${cat.count}件</span>
  </a>`;
}

function renderRecentItem(item) {
  return `<a class="customer-recent-item" href="${escapeHtml(item.detailUrl)}">
    <strong>${escapeHtml(item.title)}</strong>
    <small>${escapeHtml(item.category)}</small>
  </a>`;
}

function renderHome(data) {
  const projects = (data.demoProjects || []).map(renderProjectCard).join("");
  const categories = (data.categories || []).slice(0, 4).map(renderCategoryCard).join("");
  const recent = (data.recentItems || []).length
    ? data.recentItems.slice(0, 4).map(renderRecentItem).join("")
    : '<p class="status-muted">最近使った資料はまだありません</p>';

  return `
    <header class="customer-hero customer-hero-v2">
      <h1>${escapeHtml(data.headline || "TiSLY Knowledge")}</h1>
      <p>${escapeHtml(sanitizeCustomerTextV1(data.subheadline || ""))}</p>
    </header>
    <h2 class="customer-section-title">物件を選ぶ</h2>
    <div class="customer-project-list">${projects}</div>
    <h2 class="customer-section-title">カテゴリから探す</h2>
    <div class="customer-category-grid">${categories}</div>
    <h2 class="customer-section-title">最近使った資料</h2>
    <div class="customer-recent-list">${recent}</div>
    <div class="customer-field-link-row">
      <a href="/knowledge-customer-v1">V1 ホームへ</a>
      <a href="/knowledge-field-v1">🔧 現場向けナレッジへ</a>
    </div>
  `;
}

async function loadHome() {
  const token = getCustomerToken();
  const res = await fetch("/api/knowledge/customer-home-v2", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-v2-root").innerHTML = `<p class="status-muted">${escapeHtml(data.error || "読み込み失敗")}</p>`;
    return;
  }
  $("customer-v2-root").innerHTML = renderHome(data);
  $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV2("home");
}

async function init() {
  await requireCustomerLogin();
  await loadHome();
}

init();
