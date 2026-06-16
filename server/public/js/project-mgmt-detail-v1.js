import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/project-mgmt/v1";
const STORAGE_API = "/api/project-storage";
const TABS = [
  { id: "overview", label: "概要" },
  { id: "history", label: "履歴" },
  { id: "files", label: "ファイル" },
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
let storageData = null;

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

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

async function storageApi(projectId) {
  const token = getCustomerToken();
  const res = await fetch(`${STORAGE_API}/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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

function cardTabForKey(key) {
  const map = {
    survey: "survey",
    estimate: "estimate",
    invoice: "invoice",
    specification: "survey",
    completion: "completion",
  };
  return map[key] || "overview";
}

function renderDashboard(p) {
  const cards = (detail.workflowCards ?? [])
    .map(
      (c) => `
    <button type="button" class="wf-card" data-card-key="${escapeHtml(c.key)}" data-href="${escapeHtml(c.href || "")}">
      <span class="wf-card-icon">${c.stateIcon}</span>
      <span class="wf-card-label">${escapeHtml(c.label)}</span>
      <span class="wf-card-state">${escapeHtml(c.stateLabel)}</span>
      <span class="wf-card-summary">${escapeHtml(c.summary)}</span>
    </button>`
    )
    .join("");

  return `
    <section class="dash-meta" aria-label="案件ダッシュボード">
      <dl class="dash-info-grid">
        <dt>案件ID</dt><dd>${escapeHtml(p.projectNo)}</dd>
        <dt>ステータス</dt><dd><span class="detail-status">${escapeHtml(p.mgmtStatusLabel)}</span></dd>
        <dt>顧客名</dt><dd>${escapeHtml(p.customerName)}</dd>
        <dt>現場住所</dt><dd>${escapeHtml(p.address || "—")}</dd>
        <dt>担当者</dt><dd>${escapeHtml(p.assignee || "—")}</dd>
        <dt>作成日</dt><dd>${formatDate(p.createdAt)}</dd>
        <dt>更新日</dt><dd>${formatDate(p.updatedAt)}</dd>
      </dl>
      <div class="wf-card-grid">${cards}</div>
    </section>`;
}

function renderShareHistory() {
  const logs = detail.shareHistory ?? [];
  if (!logs.length) {
    return `<section class="share-section"><h3 class="section-sub">PDF共有履歴</h3><p class="section-hint">共有履歴はまだありません</p></section>`;
  }
  const items = logs
    .map(
      (log) => `
    <div class="share-row">
      <div class="share-doc">${escapeHtml(log.documentLabel)}</div>
      <div class="share-meta">${formatDateTime(log.sharedAt)} · ${escapeHtml(log.channelLabel)}</div>
    </div>`
    )
    .join("");
  return `<section class="share-section"><h3 class="section-sub">PDF共有履歴</h3>${items}</section>`;
}

function renderOverview(p) {
  const statusOpts = STATUS_OPTIONS.map(
    ([v, l]) =>
      `<option value="${v}"${p.mgmtStatus === v ? " selected" : ""}>${escapeHtml(l)}</option>`
  ).join("");
  return `
    ${renderShareHistory()}
    <dl class="info-grid">
      <dt>電話</dt><dd>${escapeHtml(p.phone || "—")}</dd>
      <dt>市区町村</dt><dd>${escapeHtml(p.municipality || "—")}</dd>
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
    <p class="future-field">QNAP: ${escapeHtml(p.qnapFolderPath || "—")}</p>
    <div class="btn-row">
      <button type="button" class="btn-danger" id="btn-delete-project">案件を削除</button>
    </div>`;
}

function renderHistoryTab() {
  const items = detail.timeline ?? [];
  if (!items.length) {
    return `<p class="section-hint">履歴はまだありません</p>`;
  }
  let lastDate = "";
  const rows = items
    .map((e) => {
      const showDate = e.date !== lastDate;
      if (showDate) lastDate = e.date;
      return `
      ${showDate ? `<div class="tl-date">${escapeHtml(e.date)}</div>` : ""}
      <div class="tl-item">
        <div class="tl-title">${escapeHtml(e.title)}</div>
        ${e.detail ? `<div class="tl-detail">${escapeHtml(e.detail)}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<div class="timeline-list">${rows}</div>`;
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

function renderFilesTab() {
  if (!storageData) {
    return `<p class="section-hint">読み込み中…</p>`;
  }
  const statusLine = `${storageData.qnapSyncIcon || "🟡"} ${escapeHtml(storageData.qnapSyncLabel || "未同期")}`;
  const folderPath = escapeHtml(storageData.qnapFolderPath || detail.project.qnapFolderPath || "—");
  const docKinds = [
    { kind: "estimate", label: "見積書.pdf" },
    { kind: "invoice", label: "請求書.pdf" },
    { kind: "specification", label: "仕様書.pdf" },
    { kind: "report", label: "完了報告書.pdf" },
  ];
  const fileMap = new Map((storageData.files || []).map((f) => [f.kind, f]));
  const rows = docKinds
    .map((d) => {
      const f = fileMap.get(d.kind);
      const status = f ? "🟢 保存済" : "🟡 未保存";
      return `
    <div class="storage-file-row">
      <span class="storage-file-icon">📄</span>
      <div class="storage-file-body">
        <div class="storage-file-name">${escapeHtml(d.label)}</div>
        <div class="storage-file-meta">${status}${f?.savedAt ? ` · ${formatDateTime(f.savedAt)}` : ""}</div>
      </div>
    </div>`;
    })
    .join("");

  const folders = (storageData.folders || [])
    .map((f) => `<span class="storage-folder-chip">${escapeHtml(f)}</span>`)
    .join("");

  return `
    <section class="storage-status-card" aria-label="QNAP状態">
      <div class="storage-status-row">
        <span class="storage-status-label">QNAP状態</span>
        <span class="storage-status-value">${statusLine}</span>
      </div>
      <div class="storage-path">${folderPath}</div>
    </section>
    <h3 class="section-sub">書類</h3>
    <div class="storage-file-list">${rows}</div>
    <h3 class="section-sub">フォルダ構成</h3>
    <div class="storage-folder-grid">${folders}</div>`;
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
    case "history":
      return renderHistoryTab();
    case "files":
      return renderFilesTab();
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
    ${renderDashboard(p)}
    <div class="detail-tabs" role="tablist">${tabsHtml}</div>
    <section class="tab-panel" id="tab-panel">${renderTabPanel(activeTab)}</section>`;

  root.querySelectorAll(".detail-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      activeTab = btn.getAttribute("data-tab");
      if (activeTab === "files" && !storageData) {
        try {
          storageData = await storageApi(detail.project.id);
        } catch (e) {
          toast(e.message);
        }
      }
      render();
      bindActions();
    });
  });

  root.querySelectorAll(".wf-card").forEach((card) => {
    card.addEventListener("click", () => {
      const href = card.getAttribute("data-href");
      const key = card.getAttribute("data-card-key");
      if (href) {
        window.location.href = href;
        return;
      }
      activeTab = cardTabForKey(key);
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
  if (activeTab === "files") {
    try {
      storageData = await storageApi(projectId);
    } catch {
      /* tab will show loading hint */
    }
  }
  render();
}

main().catch((e) => toast(e.message));
