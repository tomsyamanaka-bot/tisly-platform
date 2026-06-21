import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import { escapeHtml } from "./knowledge-field-shared-v1.js";

const $ = (id) => document.getElementById(id);

let filterState = {
  dateFrom: "",
  dateTo: "",
  category: "",
  projectId: "",
};

function renderRankingTable(items) {
  if (!items?.length) return '<p class="status-muted">データなし</p>';
  return `<table class="usage-stat-table">
    <thead><tr><th>タイトル</th><th>回数</th><th>最終使用</th><th>カテゴリ</th></tr></thead>
    <tbody>${items
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.title)}</td>
          <td>${r.count}</td>
          <td>${escapeHtml((r.lastUsedAt || "").slice(0, 10))}</td>
          <td>${escapeHtml(r.category || "—")}</td>
        </tr>`
      )
      .join("")}</tbody>
  </table>`;
}

function renderCategoryTable(items) {
  if (!items?.length) return '<p class="status-muted">データなし</p>';
  return `<table class="usage-stat-table">
    <thead><tr><th>カテゴリ</th><th>使用回数</th><th>最終使用</th></tr></thead>
    <tbody>${items
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.category)}</td>
          <td>${r.count}</td>
          <td>${escapeHtml((r.lastUsedAt || "").slice(0, 10))}</td>
        </tr>`
      )
      .join("")}</tbody>
  </table>`;
}

function renderProjectTable(items) {
  if (!items?.length) return '<p class="status-muted">データなし</p>';
  return `<table class="usage-stat-table">
    <thead><tr><th>案件ID</th><th>使用回数</th><th>ナレッジ数</th><th>最終使用</th></tr></thead>
    <tbody>${items
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.projectId)}</td>
          <td>${r.count}</td>
          <td>${r.knowledgeCount ?? "—"}</td>
          <td>${escapeHtml((r.lastUsedAt || "").slice(0, 10))}</td>
        </tr>`
      )
      .join("")}</tbody>
  </table>`;
}

function renderRecentLogs(items) {
  if (!items?.length) return '<p class="status-muted">データなし</p>';
  return `<table class="usage-stat-table usage-log-table">
    <thead><tr><th>タイトル</th><th>日時</th><th>案件</th><th>検索</th></tr></thead>
    <tbody>${items
      .map(
        (e) => `<tr>
          <td>${escapeHtml(e.title)}<br><small>${escapeHtml(e.category || e.kind || "—")}</small></td>
          <td>${escapeHtml((e.usedAt || "").slice(0, 16))}</td>
          <td>${escapeHtml(e.projectId || "—")}</td>
          <td>${escapeHtml(e.query || "—")}</td>
        </tr>`
      )
      .join("")}</tbody>
  </table>`;
}

function renderFilters(categories, projects) {
  const catOpts = ['<option value="">すべて</option>']
    .concat((categories || []).map((c) => `<option value="${escapeHtml(c)}"${filterState.category === c ? " selected" : ""}>${escapeHtml(c)}</option>`))
    .join("");
  const projOpts = ['<option value="">すべて</option>']
    .concat((projects || []).map((p) => `<option value="${escapeHtml(p)}"${filterState.projectId === p ? " selected" : ""}>${escapeHtml(p)}</option>`))
    .join("");
  return `<div class="usage-dash-filters friendly-card">
    <label>開始日<input type="date" id="filter-date-from" value="${escapeHtml(filterState.dateFrom)}" /></label>
    <label>終了日<input type="date" id="filter-date-to" value="${escapeHtml(filterState.dateTo)}" /></label>
    <label>カテゴリ<select id="filter-category">${catOpts}</select></label>
    <label>案件<select id="filter-project">${projOpts}</select></label>
  </div>
  <div class="usage-dash-actions">
    <button type="button" class="friendly-btn primary" id="apply-filters-btn">フィルタ適用</button>
    <button type="button" class="friendly-btn" id="clear-filters-btn">クリア</button>
    <a id="csv-export-link" href="#" role="button">CSVエクスポート</a>
  </div>`;
}

function buildQueryParams() {
  const qs = new URLSearchParams();
  if (filterState.dateFrom) qs.set("dateFrom", filterState.dateFrom);
  if (filterState.dateTo) qs.set("dateTo", filterState.dateTo);
  if (filterState.category) qs.set("category", filterState.category);
  if (filterState.projectId) qs.set("projectId", filterState.projectId);
  return qs.toString();
}

function renderDashboard(data, filterMeta) {
  const top10 = (data.topKnowledge || []).slice(0, 10);
  return `
    ${renderFilters(filterMeta.categories, filterMeta.projects)}
    <p class="usage-dash-count">使用ログ JSON 件数: <strong>${data.totalLogCount ?? 0}</strong> 件</p>
    <section class="friendly-card dash-section">
      <h2>よく使われた資料 TOP10</h2>
      ${renderRankingTable(top10)}
    </section>
    <section class="friendly-card dash-section">
      <h2>最近使われていない資料</h2>
      ${renderRankingTable(data.unusedKnowledge)}
    </section>
    <section class="friendly-card dash-section">
      <h2>カテゴリ別使用回数</h2>
      ${renderCategoryTable(data.byCategory)}
    </section>
    <section class="friendly-card dash-section">
      <h2>案件別使用回数</h2>
      ${renderProjectTable(data.byProject)}
    </section>
    <section class="friendly-card dash-section">
      <h2>最近使ったログ</h2>
      ${renderRecentLogs(data.recentLogs)}
    </section>
  `;
}

function bindFilterEvents(token) {
  $("apply-filters-btn")?.addEventListener("click", () => {
    filterState.dateFrom = $("filter-date-from")?.value || "";
    filterState.dateTo = $("filter-date-to")?.value || "";
    filterState.category = $("filter-category")?.value || "";
    filterState.projectId = $("filter-project")?.value || "";
    loadDashboard(token);
  });
  $("clear-filters-btn")?.addEventListener("click", () => {
    filterState = { dateFrom: "", dateTo: "", category: "", projectId: "" };
    loadDashboard(token);
  });
  const csvLink = $("csv-export-link");
  csvLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const qs = buildQueryParams();
      const res = await fetch(`/api/knowledge/usage-analytics-v1/export.csv${qs ? `?${qs}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("CSV export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "knowledge-usage-log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "CSVエクスポート失敗");
    }
  });
}

async function loadDashboard(token) {
  const root = $("dashboard-root");
  try {
    const qs = buildQueryParams();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const [dashRes, filterRes] = await Promise.all([
      fetch(`/api/knowledge/usage-analytics-v1/dashboard${qs ? `?${qs}` : ""}`, { headers }),
      fetch("/api/knowledge/usage-analytics-v1/filters", { headers }),
    ]);
    const data = await dashRes.json().catch(() => ({}));
    const filterMeta = await filterRes.json().catch(() => ({}));
    if (!dashRes.ok) throw new Error(data.error || `HTTP ${dashRes.status}`);
    root.innerHTML = renderDashboard(data, filterMeta);
    bindFilterEvents(token);
  } catch (e) {
    root.innerHTML = `<p class="status-muted">${escapeHtml(e.message || "読み込み失敗")}</p>`;
  }
}

async function init() {
  await requireCustomerLogin();
  const token = getCustomerToken();
  await loadDashboard(token);
}

init();
