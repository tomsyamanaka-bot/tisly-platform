import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import { escapeHtml } from "./knowledge-field-shared-v1.js";

const $ = (id) => document.getElementById(id);

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

function renderDashboard(data) {
  return `
    <section class="friendly-card dash-section">
      <h2>よく使われたナレッジ</h2>
      ${renderRankingTable(data.topKnowledge)}
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

async function init() {
  await requireCustomerLogin();
  const token = getCustomerToken();
  const root = $("dashboard-root");
  try {
    const res = await fetch("/api/knowledge/usage-analytics-v1/dashboard", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    root.innerHTML = renderDashboard(data);
  } catch (e) {
    root.innerHTML = `<p class="status-muted">${escapeHtml(e.message || "読み込み失敗")}</p>`;
  }
}

init();
