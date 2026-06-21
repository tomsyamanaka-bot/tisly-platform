import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  escapeHtml,
  renderCustomerBottomNavV1,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function renderCategoryCard(cat) {
  return `<a class="customer-category-card" href="#" data-category="${escapeHtml(cat.label)}" data-query="${escapeHtml(cat.searchQuery)}">
    <div class="customer-category-icon">${escapeHtml(cat.icon)}</div>
    <strong>${escapeHtml(cat.label)}</strong>
    <small>${escapeHtml(cat.description)}</small>
    <span class="customer-category-count">${cat.count}件</span>
  </a>`;
}

function renderRecentItem(item) {
  return `<a class="customer-recent-item" href="${escapeHtml(item.detailUrl)}">
    <strong>${escapeHtml(item.title)}</strong>
    <small>${escapeHtml(item.category)}${item.usedAt ? ` · ${escapeHtml(item.usedAt.slice(0, 10))}` : ""}</small>
  </a>`;
}

function renderSearchHit(hit) {
  const badges = [
    hit.hasPhoto ? "📷" : "",
    hit.hasPdf ? "📄" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<a class="customer-recent-item" href="${escapeHtml(hit.detailUrl)}">
    <strong>${escapeHtml(hit.title)}</strong>
    <small>${escapeHtml(hit.category)} ${badges}</small>
  </a>`;
}

function renderHome(home) {
  const categories = (home.categories || []).map(renderCategoryCard).join("");
  const recent = (home.recentItems || []).length
    ? home.recentItems.map(renderRecentItem).join("")
    : '<p class="status-muted">最近使った資料はまだありません</p>';

  return `
    <header class="customer-hero">
      <h1>TiSLY Knowledge</h1>
      <p>工事内容をわかりやすく確認できます</p>
    </header>
    <div class="customer-search-wrap friendly-card">
      <input type="search" id="customer-search-input" class="customer-search-input"
        placeholder="キーワードで探す（例：防犯カメラ、照明）" enterkeyhint="search" />
      <button type="button" id="customer-search-btn" class="customer-search-btn">資料を探す</button>
    </div>
    <div id="customer-search-results" class="customer-search-results" hidden></div>
    <h2 class="customer-section-title">カテゴリから探す</h2>
    <div class="customer-category-grid" id="customer-category-grid">${categories}</div>
    <h2 class="customer-section-title">最近使った資料</h2>
    <div class="customer-recent-list">${recent}</div>
    <div class="customer-field-link-row">
      <a href="/knowledge-field-v1">🔧 現場向けナレッジへ</a>
    </div>
  `;
}

async function searchCustomer(q, category) {
  const token = getCustomerToken();
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (category) qs.set("category", category);
  const res = await fetch(`/api/knowledge/customer-search-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "検索に失敗しました");
  return data;
}

function bindHomeEvents() {
  const runSearch = async (q, category) => {
    const mount = $("customer-search-results");
    if (!mount) return;
    if (!q && !category) {
      mount.hidden = true;
      mount.innerHTML = "";
      return;
    }
    mount.hidden = false;
    mount.innerHTML = '<p class="status-muted">検索中…</p>';
    try {
      const data = await searchCustomer(q, category);
      if (!data.hits?.length) {
        mount.innerHTML = '<p class="status-muted">該当する資料がありません</p>';
        return;
      }
      mount.innerHTML = `<p class="customer-section-title">${data.hits.length}件見つかりました</p>${data.hits.map(renderSearchHit).join("")}`;
    } catch (e) {
      mount.innerHTML = `<p class="status-muted">${escapeHtml(e.message)}</p>`;
    }
  };

  $("customer-search-btn")?.addEventListener("click", () => {
    const q = $("customer-search-input")?.value?.trim() || "";
    runSearch(q, "");
  });
  $("customer-search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = e.target.value?.trim() || "";
      runSearch(q, "");
    }
  });

  $("customer-category-grid")?.addEventListener("click", (e) => {
    const card = e.target.closest(".customer-category-card");
    if (!card) return;
    e.preventDefault();
    const query = card.getAttribute("data-query") || "";
    const category = card.getAttribute("data-category") || "";
    if ($("customer-search-input")) $("customer-search-input").value = query;
    runSearch(query, category);
    toast(`${sanitizeCustomerTextV1(category)} を表示中`);
  });
}

async function loadHome() {
  const token = getCustomerToken();
  const res = await fetch("/api/knowledge/customer-home-v1", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-home-root").innerHTML = `<p class="status-muted">${escapeHtml(data.error || "読み込み失敗")}</p>`;
    return;
  }
  $("customer-home-root").innerHTML = renderHome(data);
  $("customer-bottom-nav-mount").innerHTML = renderCustomerBottomNavV1("home");
  bindHomeEvents();
}

async function init() {
  await requireCustomerLogin();
  await loadHome();
}

init();
