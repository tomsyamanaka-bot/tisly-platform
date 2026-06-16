import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/project-mgmt/v1";
const TABS = [
  { id: "overview", label: "概要" },
  { id: "survey", label: "現調" },
  { id: "estimate", label: "見積" },
  { id: "invoice", label: "請求" },
  { id: "completion", label: "完了報告" },
  { id: "photos", label: "写真" },
];

const STATUS_OPTIONS = [
  ["inquiry", "問い合わせ"],
  ["survey_scheduled", "現調予定"],
  ["estimate_submitted", "見積提出"],
  ["ordered", "受注"],
  ["construction_scheduled", "施工予定"],
  ["construction_in_progress", "施工中"],
  ["work_completed", "完了"],
  ["invoiced", "請求済"],
  ["paid", "入金済"],
];

let detail = null;
let activeTab = "overview";

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatYen(n) {
  if (n == null) return "—";
  return `¥${Number(n).toLocaleString("ja-JP")}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function getProjectId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("projectId") || params.get("id");
}

function renderOverview(p) {
  const statusOpts = STATUS_OPTIONS.map(
    ([v, l]) =>
      `<option value="${v}"${p.mgmtStatus === v ? " selected" : ""}>${escapeHtml(l)}</option>`
  ).join("");
  return `
    <dl class="info-grid">
      <dt>案件ID</dt><dd>${escapeHtml(p.projectNo)}</dd>
      <dt>作成日</dt><dd>${formatDate(p.createdAt)}</dd>
      <dt>顧客名</dt><dd>${escapeHtml(p.customerName)}</dd>
      <dt>電話</dt><dd>${escapeHtml(p.phone || "—")}</dd>
      <dt>住所</dt><dd>${escapeHtml(p.address || "—")}</dd>
      <dt>市区町村</dt><dd>${escapeHtml(p.municipality || "—")}</dd>
      <dt>担当者</dt><dd>${escapeHtml(p.assignee || "—")}</dd>
    </dl>
    <div class="edit-field" style="margin-top:0.75rem;">
      <label for="edit-status">状態</label>
      <select id="edit-status">${statusOpts}</select>
    </div>
    <div class="edit-field">
      <label for="edit-title">案件名</label>
      <input id="edit-title" type="text" value="${escapeHtml(p.title)}" />
    </div>
    <div class="edit-field">
      <label for="edit-customer">顧客名</label>
      <input id="edit-customer" type="text" value="${escapeHtml(p.customerName)}" />
    </div>
    <div class="edit-field">
      <label for="edit-assignee">担当者</label>
      <input id="edit-assignee" type="text" value="${escapeHtml(p.assignee || "")}" />
    </div>
    <div class="btn-row">
      <button type="button" class="primary" id="btn-save-overview">保存</button>
      <a href="${escapeHtml(detail.fieldOpsHref)}">現場パイプライン</a>
    </div>
    <p class="future-field">QNAP（将来）: ${escapeHtml(p.qnapFolderPath || "—")} / ${escapeHtml(p.qnapSyncStatus || "pending")}</p>
    <div class="btn-row">
      <button type="button" class="btn-danger" id="btn-delete-project">案件を削除</button>
    </div>`;
}

function renderSurveyTab() {
  const s = detail.survey;
  if (!s.linked) {
    return `<p class="section-hint">現調案件が未連携です。</p>
      <div class="btn-row"><a class="primary" href="/survey-v1">現調PWAを開く</a></div>`;
  }
  return `
    <a class="link-card" href="${escapeHtml(s.href)}">
      <strong>現調を開く</strong>
      <span>写真 ${s.photoCount} 枚 · ID ${escapeHtml(s.surveyProjectId)}</span>
    </a>
    <div class="btn-row">
      <a class="primary" href="/document-viewer-v1.html?projectId=${encodeURIComponent(detail.project.id)}&kind=specification">仕様書を見る</a>
    </div>`;
}

function renderEstimateTab() {
  const e = detail.estimate;
  return `
    <a class="link-card${e.linked ? "" : " disabled"}" href="${escapeHtml(e.href || "#")}">
      <strong>見積</strong>
      <span>${e.linked ? `${escapeHtml(e.estimateNo || "")} · ${formatYen(e.total)}` : "未作成"}</span>
    </a>
    <div class="btn-row"><a class="primary" href="${escapeHtml(e.href)}">見積PWAを開く</a></div>`;
}

function renderInvoiceTab() {
  const inv = detail.invoice;
  return `
    <a class="link-card${inv.linked ? "" : " disabled"}" href="${escapeHtml(inv.href || "#")}">
      <strong>請求</strong>
      <span>${inv.linked ? `${escapeHtml(inv.invoiceNo || "")} · ${formatYen(inv.total)}` : "未作成"}</span>
    </a>
    <div class="btn-row"><a class="primary" href="${escapeHtml(inv.href)}">請求を開く</a></div>`;
}

function renderCompletionTab() {
  const c = detail.completionReport;
  return `
    <a class="link-card${c.linked ? "" : " disabled"}" href="${escapeHtml(c.href || "#")}">
      <strong>完了報告書</strong>
      <span>${c.linked ? "作成済み" : "未作成"}</span>
    </a>
    <div class="btn-row"><a class="primary" href="${escapeHtml(c.href || detail.fieldOpsHref)}">完了報告を見る</a></div>`;
}

function renderPhotosTab() {
  const ph = detail.photos;
  return `
    <dl class="info-grid">
      <dt>現調写真</dt><dd>${ph.surveyCount} 枚（仕様書用）</dd>
      <dt>完了報告写真</dt><dd>${ph.completionCount} 枚</dd>
    </dl>
    <div class="btn-row">
      <a href="${escapeHtml(detail.survey.href || "/survey-v1")}">現調写真</a>
      <a href="${escapeHtml(detail.estimate.href)}">完了報告写真</a>
    </div>`;
}

function renderTabPanel(tab) {
  switch (tab) {
    case "overview":
      return renderOverview(detail.project);
    case "survey":
      return renderSurveyTab();
    case "estimate":
      return renderEstimateTab();
    case "invoice":
      return renderInvoiceTab();
    case "completion":
      return renderCompletionTab();
    case "photos":
      return renderPhotosTab();
    default:
      return "";
  }
}

function render() {
  const root = document.getElementById("detail-root");
  if (!detail || !root) return;
  const p = detail.project;
  const tabsHtml = TABS.map(
    (t) =>
      `<button type="button" class="detail-tab${activeTab === t.id ? " active" : ""}" data-tab="${t.id}">${t.label}</button>`
  ).join("");

  root.innerHTML = `
    <div class="detail-header">
      <div class="detail-id">${escapeHtml(p.projectNo)}</div>
      <h1 style="margin:0.25rem 0;font-size:1.05rem;">${escapeHtml(p.title)}</h1>
      <span class="detail-status">${escapeHtml(p.mgmtStatusLabel)}</span>
    </div>
    <div class="detail-tabs" role="tablist">${tabsHtml}</div>
    <section class="tab-panel" id="tab-panel">${renderTabPanel(activeTab)}</section>`;

  root.querySelectorAll(".detail-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.getAttribute("data-tab");
      render();
      bindActions();
    });
  });
  bindActions();
}

function bindActions() {
  document.getElementById("btn-save-overview")?.addEventListener("click", async () => {
    try {
      const body = {
        title: document.getElementById("edit-title")?.value?.trim(),
        customerName: document.getElementById("edit-customer")?.value?.trim(),
        assignee: document.getElementById("edit-assignee")?.value?.trim(),
        mgmtStatus: document.getElementById("edit-status")?.value,
      };
      const data = await api(`/projects/${detail.project.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      detail = data.detail;
      toast("保存しました");
      render();
    } catch (e) {
      toast(e.message);
    }
  });

  document.getElementById("btn-delete-project")?.addEventListener("click", async () => {
    if (!confirm("この案件を削除しますか？（論理削除）")) return;
    try {
      await api(`/projects/${detail.project.id}`, { method: "DELETE" });
      toast("削除しました");
      window.location.href = "/project-mgmt-v1";
    } catch (e) {
      toast(e.message);
    }
  });
}

async function main() {
  if (!requireCustomerLogin()) return;
  const projectId = getProjectId();
  if (!projectId) {
    window.location.href = "/project-mgmt-v1";
    return;
  }

  initPracticalNav({
    appId: "project_mgmt_v1",
    appName: "案件詳細",
    theme: "blue",
    onBack: () => {
      window.location.href = "/project-mgmt-v1";
    },
  });

  detail = await api(`/projects/${encodeURIComponent(projectId)}`);
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab && TABS.some((t) => t.id === tab)) activeTab = tab;
  render();
}

main().catch((e) => toast(e.message));
