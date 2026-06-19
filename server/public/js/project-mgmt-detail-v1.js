import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { sharePdfAsFile, prefetchPdfForShare } from "./pdf-share-v1.js";

const API = "/api/project-mgmt/v1";
const TIMELINE_API = "/api/project-timeline-v1";
const STORAGE_API = "/api/project-storage";
const DOCUMENTS_API = "/api/documents/v1";
const PROJECTS_API = "/api/projects/v1";
const ESTIMATE_API = "/api/estimate/v1";
const AUTOMATION_API = "/api/project-automation/v1";
const TABS = [
  { id: "overview", label: "概要" },
  { id: "automation-tasks", label: "やる事" },
  { id: "automation-tools", label: "持ち物" },
  { id: "automation-photos", label: "施工写真" },
  { id: "survey", label: "現調" },
  { id: "estimate", label: "見積" },
  { id: "invoice", label: "請求" },
  { id: "specification", label: "仕様書" },
  { id: "completion", label: "完了報告" },
  { id: "documents", label: "書類" },
  { id: "photos", label: "写真" },
  { id: "files", label: "ファイル" },
  { id: "history", label: "履歴" },
];

const STATUS_OPTIONS = [
  ["inquiry", "問い合わせ"],
  ["survey_scheduled", "現調予定"],
  ["survey_done", "現調完了"],
  ["estimate_creating", "見積作成中"],
  ["estimate_submitted", "見積提出済"],
  ["ordered", "受注"],
  ["construction_scheduled", "施工予定"],
  ["construction_in_progress", "施工中"],
  ["completion_report_creating", "完了報告作成中"],
  ["awaiting_invoice", "請求待ち"],
  ["invoiced", "請求済"],
  ["awaiting_payment", "入金待ち"],
  ["completed", "完了"],
];

const STATUS_COLOR_STYLES = {
  gray: { bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" },
  blue: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  yellow: { bg: "#fefce8", fg: "#a16207", border: "#fde047" },
  green: { bg: "#f0fdf4", fg: "#15803d", border: "#86efac" },
  orange: { bg: "#fff7ed", fg: "#c2410c", border: "#fdba74" },
  purple: { bg: "#f5f3ff", fg: "#6d28d9", border: "#c4b5fd" },
};

let detail = null;
let activeTab = "overview";
let storageData = null;
let documentsData = null;
let timelineFilter = "all";
let timelineSearchQuery = "";
let timelineProjectId = "";
let autoTasksIncompleteOnly = false;
let autoTasksCollapseDone = true;
let autoToolsIncompleteOnly = false;
const expandedTimelineIds = new Set();
const openStorageFolders = new Set();

const TL_SESSION_PREFIX = "tisly_timeline_filter_v1";

function timelineSessionKey(projectId) {
  return `${TL_SESSION_PREFIX}:${projectId}`;
}

function resetTimelineFilterState() {
  timelineFilter = "all";
  timelineSearchQuery = "";
  expandedTimelineIds.clear();
}

function loadTimelineFilterState(projectId) {
  try {
    const raw = sessionStorage.getItem(timelineSessionKey(projectId));
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.filter === "string" && TIMELINE_FILTERS.some((f) => f.id === data.filter)) {
      timelineFilter = data.filter;
    }
    if (typeof data.query === "string") timelineSearchQuery = data.query;
  } catch {
    /* ignore */
  }
}

function saveTimelineFilterState(projectId) {
  if (!projectId) return;
  try {
    sessionStorage.setItem(
      timelineSessionKey(projectId),
      JSON.stringify({ filter: timelineFilter, query: timelineSearchQuery })
    );
  } catch {
    /* ignore */
  }
}

function ensureTimelineProjectState(projectId) {
  if (timelineProjectId === projectId) return;
  timelineProjectId = projectId;
  resetTimelineFilterState();
  loadTimelineFilterState(projectId);
}

const TIMELINE_FILTERS = [
  { id: "all", label: "すべて" },
  { id: "estimate", label: "見積" },
  { id: "invoice", label: "請求" },
  { id: "share", label: "共有" },
  { id: "qnap", label: "QNAP" },
  { id: "photo", label: "写真" },
  { id: "completion", label: "完了報告" },
];

const TIMELINE_CATEGORY_LABELS = {
  estimate: "見積",
  invoice: "請求",
  specification: "仕様書",
  completion: "完了報告",
  share: "共有",
  qnap: "QNAP",
  photo: "写真",
  drawing: "図面",
  general: "その他",
};

const TIMELINE_SEARCH_ALIASES = {
  見積: ["見積", "estimate"],
  請求: ["請求", "invoice"],
  仕様書: ["仕様", "specification"],
  完了報告: ["完了", "completion"],
  line: ["line", "共有", "pdf_shared"],
  qnap: ["qnap"],
  写真: ["写真", "photo"],
  図面: ["図面", "drawing"],
  pdf: ["pdf", ".pdf"],
};

const STORAGE_DOC_SLOTS = [
  { kind: "estimate", fallbackLabel: "見積書.pdf", viewerKind: "estimate", pdfKind: "estimate" },
  { kind: "invoice", fallbackLabel: "請求書.pdf", viewerKind: "invoice", pdfKind: "invoice" },
  {
    kind: "specification",
    fallbackLabel: "仕様書.pdf",
    viewerKind: "specification",
    pdfKind: "specification",
  },
  {
    kind: "report",
    fallbackLabel: "完了報告書.pdf",
    viewerKind: "completion-report",
    pdfKind: "report",
  },
];

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

async function qnapStorageApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`/api/storage/qnap${path}`, {
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

async function storageApi(projectId) {
  const token = getCustomerToken();
  const res = await fetch(`${STORAGE_API}/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function storagePost(projectId, path, body) {
  const token = getCustomerToken();
  const res = await fetch(`${STORAGE_API}/${encodeURIComponent(projectId)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function documentViewerHref(projectId, viewerKind, tabHint) {
  const params = new URLSearchParams({
    projectId,
    kind: viewerKind,
    return: buildDetailReturnUrl(tabHint || activeTab),
  });
  return `/document-viewer-v1.html?${params}`;
}

function storageFileUrl(projectId, relativePath) {
  const token = getCustomerToken();
  const params = new URLSearchParams({
    relativePath,
    access_token: token,
  });
  return `${STORAGE_API}/${encodeURIComponent(projectId)}/file?${params}`;
}

function pdfFileUrl(projectId, pdfKind) {
  const token = getCustomerToken();
  return `${PROJECTS_API}/projects/${encodeURIComponent(projectId)}/pdfs/${encodeURIComponent(pdfKind)}/file?access_token=${encodeURIComponent(token)}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
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

async function automationApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${AUTOMATION_API}${path}`, {
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

async function refreshAutomation() {
  if (!detail?.project?.id) return;
  detail.automation = await automationApi(`/projects/${detail.project.id}`);
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
    specification: "specification",
    completion: "completion",
  };
  return map[key] || "overview";
}

function qnapSyncBadge(projectStatus) {
  if (projectStatus === "synced") return { icon: "🟢", label: "QNAP保存済" };
  if (projectStatus === "error") return { icon: "🔴", label: "エラー" };
  return { icon: "🟡", label: "未保存" };
}

function renderDocumentStatusSummary() {
  const docs = detail.documentsStatus?.documents ?? [];
  if (!docs.length) return `<p class="section-hint">書類状態を取得できません</p>`;
  const rows = docs
    .map(
      (d) => {
        const storage = d.storageStatusIcon && d.storageStatusLabel
          ? ` · ${d.storageStatusIcon}${d.storageStatusLabel}`
          : "";
        const pdf = d.hasPdf ? " · 📄PDF" : "";
        const photos = d.hasPhotos ? " · 📷写真" : "";
        return `
    <div class="doc-status-row">
      <span class="doc-status-icon">${d.statusIcon}</span>
      <span class="doc-status-label">${escapeHtml(d.label)}</span>
      <span class="doc-status-value">${escapeHtml(d.statusLabel)}${storage}${pdf}${photos}</span>
    </div>`;
      }
    )
    .join("");
  return `<div class="doc-status-grid">${rows}</div>`;
}

function renderDocumentTimeline(limit = 5) {
  const docTypes = new Set([
    "estimate_created",
    "estimate_pdf_saved",
    "invoice_created",
    "invoice_pdf_saved",
    "specification_created",
    "specification_saved",
    "completion_created",
    "completion_saved",
    "qnap_saved",
    "photo_added",
    "drawing_added",
  ]);
  const items = (detail.timeline ?? []).filter((e) => docTypes.has(e.eventType)).slice(0, limit);
  if (!items.length) {
    return `<p class="section-hint">まだドキュメント履歴がありません</p>`;
  }
  return `<div class="recent-history-list">${items
    .map((e) => {
      const d = new Date(e.date || e.createdAt || "");
      const label = Number.isNaN(d.getTime())
        ? String(e.dateGroup || e.date || "—").slice(5, 10).replace("-", "/")
        : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
      return `<div class="recent-history-row">
        <span class="recent-history-date">${escapeHtml(label)}</span>
        <span class="recent-history-title">${escapeHtml(e.title)}${e.description ? ` — ${escapeHtml(e.description)}` : ""}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderRecentHistory(limit = 3) {
  const items = (detail.timeline ?? []).slice(0, limit);
  if (!items.length) {
    return `<p class="section-hint">まだ履歴がありません</p>`;
  }
  const rows = items
    .map(
      (e) => `
    <div class="recent-history-row">
      <span class="recent-history-date">${escapeHtml(e.dateGroup || e.date?.slice(0, 10) || "—")}</span>
      <span class="recent-history-title">${escapeHtml(e.title)}</span>
    </div>`
    )
    .join("");
  return `
    <div class="recent-history-list">${rows}</div>
    <div class="btn-row">
      <button type="button" class="primary" id="btn-open-history">履歴をすべて見る</button>
    </div>`;
}

function renderQnapStatusSummary(p) {
  const qnap = qnapSyncBadge(p.qnapSyncStatus);
  return `
    <div class="qnap-status-summary">
      <span class="qnap-status-icon">${qnap.icon}</span>
      <span class="qnap-status-label">${escapeHtml(qnap.label)}</span>
    </div>
    <p class="qnap-path-hint">${escapeHtml(p.qnapFolderPath || "—")}</p>`;
}

function resolveDashboardReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("return");
  if (ret && ret.startsWith("/")) return ret;
  return "/project-dashboard-v1";
}

function resolveListReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("listReturn");
  if (ret && ret.startsWith("/")) return ret;
  return "/project-mgmt-v1";
}

function buildDetailReturnUrl(tab) {
  const params = new URLSearchParams(window.location.search);
  if (tab) params.set("tab", tab);
  return `${window.location.pathname}?${params}`;
}

function renderBackLinks() {
  const dashHref = resolveDashboardReturnUrl();
  const listHref = resolveListReturnUrl();
  return `
    <nav class="detail-back-nav" aria-label="戻る">
      <a href="${escapeHtml(dashHref)}" class="dash-back-link">← ダッシュボード</a>
      <a href="${escapeHtml(listHref)}" class="dash-back-link dash-back-link-secondary">← 案件一覧</a>
    </nav>`;
}

function docEntryForKind(kind) {
  return (detail.documentsStatus?.documents ?? []).find((d) => d.kind === kind);
}

function tabBadgeForTab(tabId) {
  const docs = detail.documentsStatus?.documents ?? [];
  const qnap = detail.project.qnapSyncStatus;
  switch (tabId) {
    case "survey": {
      const card = (detail.workflowCards ?? []).find((c) => c.key === "survey");
      return card ? `${card.stateIcon}` : "";
    }
    case "estimate":
      return docEntryForKind("estimate")?.statusIcon ?? "";
    case "invoice":
      return docEntryForKind("invoice")?.statusIcon ?? "";
    case "specification":
      return docEntryForKind("specification")?.statusIcon ?? "";
    case "completion":
      return docEntryForKind("completion")?.statusIcon ?? "";
    case "photos": {
      const spec = docEntryForKind("specification");
      const comp = docEntryForKind("completion");
      if (spec?.status === "photos_missing" || comp?.status === "completion_photos_missing") {
        return "📷";
      }
      return "";
    }
    case "files":
      if (qnap === "synced") return "🟢";
      if (qnap === "error") return "🔴";
      return "🟡";
    case "documents":
      return documentsData?.totalDocuments ? `📁${documentsData.totalDocuments}` : "📁";
    case "automation-tasks": {
      const prog = detail.automation?.progress?.tasks;
      if (!prog?.total) return "";
      return prog.percent >= 100 ? "✓" : `${prog.done}/${prog.total}`;
    }
    case "automation-tools": {
      const prog = detail.automation?.progress?.tools;
      if (!prog?.total) return "";
      return prog.percent >= 100 ? "✓" : `${prog.checked}/${prog.total}`;
    }
    case "automation-photos": {
      const prog = detail.automation?.progress?.photos;
      if (!prog?.total) return "";
      return prog.percent >= 100 ? "✓" : `${prog.shot}/${prog.total}`;
    }
    default:
      return "";
  }
}

function renderNextActionsCard() {
  const actions = detail.nextActions ?? [];
  if (!actions.length) {
    return `
      <section class="next-actions-card next-actions-done" aria-label="次にやること">
        <h2 class="next-actions-title">次にやること</h2>
        <p class="next-actions-empty">✅ すべて完了しています</p>
      </section>`;
  }
  const items = actions
    .map(
      (a) => `
    <button type="button" class="next-action-item" data-next-tab="${escapeHtml(a.tab || "")}" data-next-href="${escapeHtml(a.href || "")}">
      <span class="next-action-icon">${a.icon}</span>
      <span class="next-action-label">${escapeHtml(a.label)}</span>
    </button>`
    )
    .join("");
  return `
    <section class="next-actions-card" aria-label="次にやること">
      <h2 class="next-actions-title">次にやること</h2>
      <div class="next-actions-list">${items}</div>
    </section>`;
}

function renderProgressBar(label, done, total, percent) {
  if (!total) return "";
  return `
    <div class="auto-progress-row">
      <div class="auto-progress-head">
        <span>${escapeHtml(label)}</span>
        <span class="auto-progress-pct">${done}/${total} (${percent}%)</span>
      </div>
      <div class="auto-progress-track"><div class="auto-progress-fill" style="width:${percent}%"></div></div>
    </div>`;
}

function renderAutomationProgressCard() {
  const auto = detail.automation;
  if (!auto?.templateName && !auto?.tasks?.length) {
    return `<section class="auto-card"><p class="section-hint">案件種別テンプレートが未適用です。案件一覧から種別を選んで作成してください。</p></section>`;
  }
  const prog = auto.progress;
  return `
    <section class="auto-card" aria-label="自動化進捗">
      <h3 class="section-sub">進捗 ${auto.templateName ? `（${escapeHtml(auto.templateName)}）` : ""}</h3>
      ${renderProgressBar("やる事", prog.tasks.done, prog.tasks.total, prog.tasks.percent)}
      ${renderProgressBar("持ち物", prog.tools.checked, prog.tools.total, prog.tools.percent)}
      ${renderProgressBar("写真", prog.photos.shot, prog.photos.total, prog.photos.percent)}
      ${renderProgressBar("書類", prog.documents.done, prog.documents.total, prog.documents.percent)}
    </section>`;
}

function renderAiSuggestionsCard() {
  const suggestions = detail.automation?.suggestions ?? [];
  if (!suggestions.length) return "";
  const items = suggestions
    .map(
      (s) => `
    <div class="ai-suggestion-item">
      <span>💡 ${escapeHtml(s.label)}</span>
      <button type="button" class="ai-dismiss-btn" data-suggestion-id="${escapeHtml(s.id)}">✕</button>
    </div>`
    )
    .join("");
  return `
    <section class="auto-card ai-suggestions-card" aria-label="AI提案">
      <h3 class="section-sub">現場アシスト（ルールベース）</h3>
      <div class="ai-suggestion-list">${items}</div>
    </section>`;
}

function renderAutomationTasksTab() {
  const tasks = detail.automation?.tasks ?? [];
  if (!tasks.length) {
    return `<p class="section-hint">やる事テンプレートがありません</p>`;
  }
  const prog = detail.automation?.progress?.tasks;
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const visible = autoTasksIncompleteOnly ? pending : tasks;
  const doneSection =
    !autoTasksIncompleteOnly && autoTasksCollapseDone && done.length
      ? `<details class="auto-done-collapse"><summary>完了済み ${done.length}件</summary>
         ${done.map((t) => renderTaskRow(t)).join("")}
       </details>`
      : !autoTasksIncompleteOnly
        ? done.map((t) => renderTaskRow(t)).join("")
        : "";
  return `
    ${renderAiSuggestionsCard()}
    ${renderAutomationProgressCard()}
    <div class="auto-tab-toolbar">
      <label><input type="checkbox" id="auto-tasks-incomplete" ${autoTasksIncompleteOnly ? "checked" : ""} /> 未完了だけ</label>
      <label><input type="checkbox" id="auto-tasks-collapse" ${autoTasksCollapseDone ? "checked" : ""} /> 完了済み折りたたみ</label>
    </div>
    <h3 class="section-sub">チェックリスト ${prog ? `（${prog.done}/${prog.total} · ${prog.percent}%）` : ""}</h3>
    <div class="auto-check-list">${visible.filter((t) => !t.done).map((t) => renderTaskRow(t)).join("")}</div>
    ${doneSection}
    <div class="auto-add-row">
      <input type="text" id="auto-task-add-input" placeholder="現場で追加するやる事" />
      <button type="button" id="btn-auto-task-add">追加</button>
    </div>`;
}

function renderTaskRow(t) {
  return `
    <div class="auto-check-item-wrap" data-task-id="${escapeHtml(t.id)}">
      <label class="auto-check-item">
        <input type="checkbox" class="auto-task-check" data-task-id="${escapeHtml(t.id)}" ${t.done ? "checked" : ""} />
        <span class="auto-task-label ${t.done ? "done" : ""}">${escapeHtml(t.label)}</span>
      </label>
      <input type="text" class="auto-memo-input" data-task-memo="${escapeHtml(t.id)}" placeholder="メモ" value="${escapeHtml(t.memo || "")}" />
    </div>`;
}

function renderAutomationToolsTab() {
  const tools = detail.automation?.tools ?? [];
  if (!tools.length) {
    return `<p class="section-hint">持ち物テンプレートがありません</p>`;
  }
  const prog = detail.automation?.progress?.tools;
  const visible = autoToolsIncompleteOnly ? tools.filter((t) => !t.checked) : tools;
  const items = visible
    .map(
      (t) => `
    <div class="auto-check-item-wrap" data-tool-id="${escapeHtml(t.id)}">
      <label class="auto-check-item">
        <input type="checkbox" class="auto-tool-check" data-tool-id="${escapeHtml(t.id)}" ${t.checked ? "checked" : ""} />
        <span class="${t.checked ? "done" : ""}">${escapeHtml(t.label)}</span>
      </label>
      <input type="text" class="auto-memo-input" data-tool-memo="${escapeHtml(t.id)}" placeholder="メモ" value="${escapeHtml(t.memo || "")}" />
      <input type="text" class="auto-forgot-input" data-tool-forgot="${escapeHtml(t.id)}" placeholder="忘れ物メモ" value="${escapeHtml(t.forgottenMemo || "")}" />
    </div>`
    )
    .join("");
  return `
    ${renderAutomationProgressCard()}
    <div class="auto-tab-toolbar">
      <label><input type="checkbox" id="auto-tools-incomplete" ${autoToolsIncompleteOnly ? "checked" : ""} /> 未確認だけ</label>
    </div>
    <h3 class="section-sub">持ち物 ${prog ? `（${prog.checked}/${prog.total} · ${prog.percent}%）` : ""}</h3>
    <div class="auto-check-list">${items}</div>
    <div class="auto-add-row">
      <input type="text" id="auto-tool-add-input" placeholder="現場で追加する持ち物" />
      <button type="button" id="btn-auto-tool-add">追加</button>
    </div>`;
}

function renderAutomationPhotosTab() {
  const photos = detail.automation?.photos ?? [];
  if (!photos.length) {
    return `<p class="section-hint">写真テンプレートがありません</p>`;
  }
  const prog = detail.automation?.progress?.photos;
  const unshot = detail.automation?.unshotPhotos ?? [];
  const items = photos
    .map(
      (p) => `
    <div class="auto-photo-item ${p.shot ? "shot" : "unshot"}">
      <span class="auto-photo-icon">${p.shot ? "✅" : "📷"}</span>
      <span class="auto-photo-label">${escapeHtml(p.label)}</span>
      ${p.shot ? `<span class="auto-photo-meta">撮影済</span>` : `<span class="auto-photo-meta warn">未撮影</span>`}
      ${p.documentId ? `<a class="auto-photo-link" href="/documents-v1?projectId=${encodeURIComponent(detail.project.id)}">DC</a>` : ""}
    </div>`
    )
    .join("");
  const unshotHint =
    unshot.length > 0
      ? `<p class="section-hint unshot-hint">未撮影 ${unshot.length}件 — Document Center から施工写真をアップロードして紐付けできます</p>
         <p class="link-row"><a class="primary" href="/documents-v1?projectId=${encodeURIComponent(detail.project.id)}">Document Center で写真アップロード →</a></p>`
      : `<p class="section-hint" style="color:#15803d">すべての施工写真が撮影済みです</p>`;
  return `
    ${renderAutomationProgressCard()}
    <h3 class="section-sub">施工写真 ${prog ? `（${prog.shot}/${prog.total} · ${prog.percent}%）` : ""}</h3>
    ${unshotHint}
    <div class="auto-photo-list">${items}</div>`;
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
    ${renderBackLinks()}
    <header class="detail-header">
      <h1 class="detail-title">${escapeHtml(p.customerName)}</h1>
      <p class="detail-subtitle">${escapeHtml(p.title)} · ${escapeHtml(p.projectNo)}</p>
    </header>
    ${renderNextActionsCard()}
    ${renderAiSuggestionsCard()}
    <section class="dash-meta" aria-label="ワークフロー">
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

function statusBadgeStyle(colorGroup) {
  const s = STATUS_COLOR_STYLES[colorGroup] || STATUS_COLOR_STYLES.gray;
  return `background:${s.bg};color:${s.fg};border:1px solid ${s.border}`;
}

function renderStatusHero() {
  const ps = detail?.projectStatus;
  if (!ps) return "";
  const style = statusBadgeStyle(ps.statusColor);
  return `
    <section class="status-hero" aria-label="現在ステータス">
      <p class="status-hero-label">現在ステータス</p>
      <p class="status-hero-value" style="${style}">${escapeHtml(ps.statusLabel)}</p>
      <p class="status-hero-updated">自動判定 · 更新 ${formatDateTime(ps.updatedAt)}</p>
    </section>`;
}

function renderOverview(p) {
  const ps = detail.projectStatus;
  const autoStatus = ps?.statusLabel ?? p.mgmtStatusLabel;
  const autoColor = ps?.statusColor ?? p.statusColor ?? "gray";
  const statusOpts = STATUS_OPTIONS.map(
    ([v, l]) =>
      `<option value="${v}"${p.mgmtStatus === v ? " selected" : ""}>${escapeHtml(l)}</option>`
  ).join("");
  const todayActions = (detail.nextActions ?? [])
    .slice(0, 3)
    .map((a) => `<li>${a.icon} ${escapeHtml(a.label)}</li>`)
    .join("");
  const todayBlock = todayActions
    ? `<ul class="today-actions-list">${todayActions}</ul>`
    : `<p class="section-hint">✅ 今日のタスクはありません</p>`;

  return `
    ${renderStatusHero()}
    <section class="overview-section">
      <h3 class="section-sub">基本情報</h3>
      <dl class="info-grid overview-info-grid">
        <dt>案件ID</dt><dd>${escapeHtml(p.projectNo)}</dd>
        <dt>顧客名</dt><dd>${escapeHtml(p.customerName)}</dd>
        <dt>現場名</dt><dd>${escapeHtml(p.title)}</dd>
        <dt>住所</dt><dd>${escapeHtml(p.address || "—")}</dd>
        <dt>担当</dt><dd>${escapeHtml(p.assignee || "—")}</dd>
        <dt>ステータス</dt><dd><span class="detail-status" style="${statusBadgeStyle(autoColor)}">${escapeHtml(autoStatus)}</span></dd>
      </dl>
    </section>
    <section class="overview-section">
      <h3 class="section-sub">今日やること</h3>
      ${todayBlock}
    </section>
    ${renderAutomationProgressCard()}
    <section class="overview-section">
      <h3 class="section-sub">最近の履歴</h3>
      ${renderRecentHistory(3)}
    </section>
    <section class="overview-section">
      <h3 class="section-sub">ドキュメント履歴</h3>
      ${renderDocumentTimeline(5)}
      <p class="link-row"><a href="/documents-v1?projectId=${encodeURIComponent(p.id)}">Document Center で開く →</a></p>
    </section>
    <section class="overview-section">
      <h3 class="section-sub">書類状態</h3>
      ${renderDocumentStatusSummary()}
    </section>
    <section class="overview-section">
      <h3 class="section-sub">QNAP保存状態</h3>
      ${renderQnapStatusSummary(p)}
    </section>
    <section class="overview-section overview-edit">
      <h3 class="section-sub">編集</h3>
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
      <div class="btn-row">
        <button type="button" class="btn-danger" id="btn-delete-project">案件を削除</button>
      </div>
    </section>`;
}

function timelineCategoryClass(category, eventType) {
  const map = {
    estimate: "tl-cat-estimate",
    invoice: "tl-cat-invoice",
    specification: "tl-cat-specification",
    completion: "tl-cat-completion",
    share: "tl-cat-share",
    qnap: "tl-cat-qnap",
    photo: "tl-cat-photo",
    drawing: "tl-cat-photo",
  };
  if (map[category]) return map[category];
  if (eventType === "drawing_added") return "tl-cat-photo";
  return "tl-cat-general";
}

function timelineCategoryLabel(category, eventType) {
  if (category && TIMELINE_CATEGORY_LABELS[category]) return TIMELINE_CATEGORY_LABELS[category];
  if (eventType === "drawing_added") return "図面";
  return "その他";
}

function timelineTimeLabel(item) {
  if (item.date?.includes(" ")) return item.date.split(" ")[1];
  const d = new Date(item.createdAt);
  if (Number.isNaN(d.getTime())) return item.date || "—";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function timelineSearchHaystack(item) {
  const p = detail?.project;
  const parts = [
    item.title,
    item.detail || "",
    item.eventType || "",
    item.category || "",
    timelineCategoryLabel(item.category, item.eventType),
    p?.customerName || "",
    p?.projectNo || "",
    p?.id || "",
    p?.title || "",
  ];
  return parts.join(" ").toLowerCase();
}

function timelineSearchMatches(haystack, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (haystack.includes(q)) return true;
  const aliasTerms = TIMELINE_SEARCH_ALIASES[q];
  if (aliasTerms) return aliasTerms.some((term) => haystack.includes(term.toLowerCase()));
  for (const [key, terms] of Object.entries(TIMELINE_SEARCH_ALIASES)) {
    if (key.includes(q) || q.includes(key)) {
      if (terms.some((term) => haystack.includes(term.toLowerCase()))) return true;
    }
  }
  return false;
}

function filterTimelineItems(items) {
  return items.filter((e) => {
    const hay = timelineSearchHaystack(e);
    if (!timelineSearchMatches(hay, timelineSearchQuery)) return false;
    if (timelineFilter === "all") return true;
    if (e.category === timelineFilter) return true;
    if (timelineFilter === "estimate") return hay.includes("見積") || hay.includes("estimate");
    if (timelineFilter === "invoice") return hay.includes("請求") || hay.includes("invoice");
    if (timelineFilter === "share") return hay.includes("共有") || hay.includes("line");
    if (timelineFilter === "qnap") return hay.includes("qnap");
    if (timelineFilter === "completion") return hay.includes("完了") || hay.includes("completion");
    if (timelineFilter === "photo") return hay.includes("写真") || hay.includes("図面") || hay.includes("photo") || hay.includes("drawing");
    return false;
  });
}

function timelineCounts(items) {
  const total = items.length;
  const backfill = items.filter((e) => e.isBackfill).length;
  return { total, backfill, normal: total - backfill };
}

function renderTimelineCard(e) {
  const catClass = timelineCategoryClass(e.category, e.eventType);
  const catLabel = timelineCategoryLabel(e.category, e.eventType);
  const expanded = expandedTimelineIds.has(e.id);
  const hasDetail = Boolean(e.detail?.trim());
  const backfillBadge = e.isBackfill
    ? `<span class="tl-backfill-badge">自動補完</span>`
    : "";
  return `
    <button type="button" class="tl-card ${catClass}${expanded ? " expanded" : ""}" data-tl-expand="${escapeHtml(e.id)}"${hasDetail ? "" : ' aria-disabled="true"'}>
      <div class="tl-card-head">
        <span class="tl-time">${escapeHtml(timelineTimeLabel(e))}</span>
        <span class="tl-type-badge">${escapeHtml(catLabel)}</span>
        ${backfillBadge}
      </div>
      <div class="tl-title">${escapeHtml(e.title)}</div>
      ${hasDetail ? `<div class="tl-detail${expanded ? "" : " clamped"}">${escapeHtml(e.detail)}</div>` : ""}
      ${hasDetail && !expanded ? `<span class="tl-expand-hint">タップで全文表示</span>` : ""}
      ${hasDetail && expanded ? `<span class="tl-expand-hint">タップで閉じる</span>` : ""}
    </button>`;
}

function groupTimelineByDate(items) {
  const groups = [];
  const map = new Map();
  for (const item of items) {
    const key = item.dateGroup || item.date?.slice(0, 10) || "—";
    if (!map.has(key)) {
      const group = { dateLabel: key, items: [] };
      map.set(key, group);
      groups.push(group);
    }
    map.get(key).items.push(item);
  }
  return groups;
}

function renderHistoryTab() {
  const allItems = detail.timeline ?? [];
  const counts = timelineCounts(allItems);
  const items = filterTimelineItems(allItems);
  const chips = TIMELINE_FILTERS.map(
    (f) =>
      `<button type="button" class="tl-filter-chip${timelineFilter === f.id ? " active" : ""}" data-tl-filter="${f.id}">${f.label}</button>`
  ).join("");
  const statsRow = `
    <div class="tl-stats-row">
      <span class="tl-stat">履歴 <strong>${counts.total}</strong>件</span>
      <span class="tl-stat tl-stat-backfill">自動補完 <strong>${counts.backfill}</strong>件</span>
    </div>`;
  const searchRow = `
    <div class="tl-toolbar">
      ${statsRow}
      <div class="tl-search-row">
        <input type="search" id="tl-search-input" class="tl-search-input" placeholder="見積・請求・LINE・QNAP・顧客名…" value="${escapeHtml(timelineSearchQuery)}" autocomplete="off" />
      </div>
      <div class="tl-search-row tl-chip-row">${chips}</div>
    </div>`;
  if (!allItems.length) {
    return `
      ${searchRow}
      <div class="tl-empty">
        <p class="section-hint">まだ履歴がありません</p>
        <p class="tl-empty-guide">見積作成・PDF保存・LINE共有・QNAP保存を行うとここに記録されます</p>
      </div>`;
  }
  if (!items.length) {
    return `
      ${searchRow}
      <div class="tl-empty">
        <p class="section-hint">条件に合う履歴がありません</p>
        <p class="tl-empty-guide">フィルタや検索語を変えるか、見積作成・PDF保存・LINE共有・QNAP保存を行うと履歴が増えます</p>
      </div>`;
  }
  const groups = groupTimelineByDate(items);
  const rows = groups
    .map((g) => {
      const groupItems = g.items.map((e) => renderTimelineCard(e)).join("");
      return `
      <section class="tl-date-group">
        <h4 class="tl-date-heading">${escapeHtml(g.dateLabel)}</h4>
        <div class="timeline-list">${groupItems}</div>
      </section>`;
    })
    .join("");
  return `
    ${searchRow}
    <div class="tl-timeline-body">${rows}</div>
    <p class="tl-count-hint">表示 ${items.length}件</p>`;
}

function findPdfEntry(pdfKind) {
  return (detail.documents || []).find((d) => d.kind === pdfKind);
}

function renderDocTabActions(pdfKind, viewerKind, storageKind, docKind) {
  const entry = findPdfEntry(pdfKind);
  const statusEntry = docKind ? docEntryForKind(docKind) : null;
  const statusLine = statusEntry
    ? `<p class="doc-tab-status">${statusEntry.statusIcon} ${escapeHtml(statusEntry.statusLabel)}</p>`
    : "";
  if (!entry?.exists) {
    return `${statusLine}<p class="storage-file-empty">PDF未保存 — 作成後にここから開けます</p>`;
  }
  const displayName = entry.fileName || `${pdfKind}.pdf`;
  const resaveKind = storageKind || pdfKind;
  return `
    ${statusLine}
    <div class="storage-file-actions doc-tab-actions">
      <a class="storage-action-btn primary" href="${escapeHtml(documentViewerHref(detail.project.id, viewerKind, activeTab))}">開く</a>
      <button type="button" class="storage-action-btn" data-storage-share="${escapeHtml(pdfKind)}" data-share-name="${escapeHtml(displayName)}">共有</button>
      <button type="button" class="storage-action-btn" data-storage-resave="${escapeHtml(resaveKind)}">保存し直す</button>
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
    <div class="btn-row"><a href="/survey-v1">現調PWAを開く</a></div>`;
}

function renderSpecificationTab() {
  const s = detail.survey;
  const specEntry = findPdfEntry("specification");
  const photoHint = s.linked
    ? `現調写真 ${s.photoCount} 枚`
    : "現調未連携 — 写真は仕様書に反映されません";
  return `
    <p class="section-hint">${escapeHtml(photoHint)}</p>
    <h3 class="section-sub">仕様書</h3>
    ${renderDocTabActions("specification", "specification", "specification", "specification")}
    ${specEntry?.exists ? "" : `<div class="btn-row"><a class="primary" href="${escapeHtml(s.href || "/survey-v1")}">現調から仕様書を作成</a></div>`}`;
}

function renderEstimateTab() {
  const e = detail.estimate;
  return `
    <a class="link-card${e.linked ? "" : " disabled"}" href="${escapeHtml(e.href || "#")}">
      <strong>見積</strong>
      <span>${e.linked ? `${escapeHtml(e.estimateNo || "")} · ${formatYen(e.total)}` : "未作成"}</span>
    </a>
    <h3 class="section-sub">見積書</h3>
    ${renderDocTabActions("estimate", "estimate", "estimate", "estimate")}
    <div class="btn-row"><a class="primary" href="${escapeHtml(e.href)}">見積PWAを開く</a></div>`;
}

function renderInvoiceTab() {
  const inv = detail.invoice;
  return `
    <a class="link-card${inv.linked ? "" : " disabled"}" href="${escapeHtml(inv.href || "#")}">
      <strong>請求</strong>
      <span>${inv.linked ? `${escapeHtml(inv.invoiceNo || "")} · ${formatYen(inv.total)}` : "未作成"}</span>
    </a>
    <h3 class="section-sub">請求書</h3>
    ${renderDocTabActions("invoice", "invoice", "invoice", "invoice")}
    <div class="btn-row"><a class="primary" href="${escapeHtml(inv.href)}">請求を開く</a></div>`;
}

function renderCompletionTab() {
  const c = detail.completionReport;
  return `
    <a class="link-card${c.linked ? "" : " disabled"}" href="${escapeHtml(c.href || "#")}">
      <strong>完了報告書</strong>
      <span>${c.linked ? "作成済み" : "未作成"}</span>
    </a>
    <h3 class="section-sub">完了報告書</h3>
    ${renderDocTabActions("report", "completion-report", "report", "completion")}
    <div class="btn-row"><a class="primary" href="${escapeHtml(c.href || detail.fieldOpsHref)}">完了報告を見る</a></div>`;
}

function renderFilesTab() {
  if (!storageData) {
    return `<p class="section-hint">読み込み中…</p>`;
  }
  const statusLine = `${storageData.qnapSyncIcon || "🟡"} ${escapeHtml(storageData.qnapSyncLabel || "未同期")}`;
  const folderPath = escapeHtml(storageData.qnapFolderPath || detail.project.qnapFolderPath || "—");
  const projectId = detail.project.id;

  const docSlots = storageData.documents?.length
    ? storageData.documents
    : STORAGE_DOC_SLOTS.map((slot) => {
        const f = (storageData.files || []).find((x) => x.kind === slot.kind);
        return {
          kind: slot.kind,
          docLabel: slot.fallbackLabel.replace(/\.pdf$/, ""),
          fileName: f?.fileName ?? null,
          saveStatusIcon: f ? "✅" : "🟡",
          saveStatusLabel: f ? "保存済み" : "未保存",
          viewerKind: slot.viewerKind,
          pdfKind: slot.pdfKind,
          savedAt: f?.savedAt ?? null,
        };
      });

  const projectQnap = storageData.qnapSyncStatus || "pending";
  const docRows = docSlots
    .map((doc) => {
      const saved = doc.saveStatus === "saved" || Boolean(doc.fileName);
      const displayName = doc.fileName || `${doc.docLabel}.pdf`;
      const qnap = saved
        ? qnapSyncBadge(projectQnap)
        : qnapSyncBadge(doc.saveStatus === "error" ? "error" : "pending");
      const status = `${doc.saveStatusIcon || "🟡"} ${escapeHtml(doc.saveStatusLabel || "未保存")} · ${qnap.icon} ${escapeHtml(qnap.label)}`;
      const canOpen = saved || doc.hasLocalPdf;
      const actions = canOpen
        ? `
      <div class="storage-file-actions">
        <a class="storage-action-btn primary" href="${escapeHtml(documentViewerHref(projectId, doc.viewerKind, "files"))}">開く</a>
        <button type="button" class="storage-action-btn" data-storage-share="${escapeHtml(doc.pdfKind || doc.kind)}" data-share-name="${escapeHtml(displayName)}">共有</button>
        <button type="button" class="storage-action-btn" data-storage-resave="${escapeHtml(doc.kind)}">保存し直す</button>
      </div>`
        : `<p class="storage-file-empty">PDF未保存 — 見積PWA等で作成してください</p>`;
      return `
    <div class="storage-file-row${saved ? "" : " is-empty"}" data-storage-kind="${escapeHtml(doc.kind)}">
      <span class="storage-file-icon">📄</span>
      <div class="storage-file-body">
        <div class="storage-file-name">${escapeHtml(doc.docLabel)}</div>
        <div class="storage-file-meta">${status}${doc.savedAt ? ` · ${formatDateTime(doc.savedAt)}` : ""}</div>
        ${doc.fileName ? `<div class="storage-file-subname">${escapeHtml(doc.fileName)}</div>` : ""}
        ${actions}
      </div>
    </div>`;
    })
    .join("");

  const folderBlocks = (storageData.folderContents || storageData.folders?.map((f) => ({ folder: f, files: [] })) || [])
    .map((fc) => {
      const folder = fc.folder;
      const isOpen = openStorageFolders.has(folder);
      const count = fc.files?.length ?? 0;
      const fileLines = (fc.files || [])
        .map((f) => {
          const isDocPdf =
            f.mediaKind === "pdf" &&
            ["02_見積", "03_請求", "04_仕様書", "05_完了報告"].includes(folder) &&
            !f.displayName.includes("/");
          let openHref = "";
          if (isDocPdf) {
            const kindMap = {
              "02_見積": "estimate",
              "03_請求": "invoice",
              "04_仕様書": "specification",
              "05_完了報告": "completion-report",
            };
            openHref = documentViewerHref(projectId, kindMap[folder] || "estimate");
          } else if (f.relativePath) {
            openHref = storageFileUrl(projectId, f.relativePath);
          }
          const nameCell = openHref
            ? `<a class="storage-folder-file-link" href="${escapeHtml(openHref)}" target="_blank" rel="noopener">${escapeHtml(f.displayName || f.fileName)}</a>`
            : escapeHtml(f.displayName || f.fileName);
          return `
        <div class="storage-folder-file">
          <span class="storage-folder-file-icon">${f.icon || "📄"}</span>
          ${nameCell}
        </div>`;
        })
        .join("");
      return `
    <div class="storage-folder-block${isOpen ? " is-open" : ""}" data-storage-folder="${escapeHtml(folder)}">
      <button type="button" class="storage-folder-header" aria-expanded="${isOpen}">
        <span class="storage-folder-chevron">${isOpen ? "▼" : "▶"}</span>
        <span class="storage-folder-icon">📁</span>
        <span class="storage-folder-name">${escapeHtml(folder)}</span>
        <span class="storage-folder-count">${count}件</span>
      </button>
      <div class="storage-folder-body"${isOpen ? "" : " hidden"}>
        ${fileLines || `<p class="storage-file-empty">ファイルなし</p>`}
      </div>
    </div>`;
    })
    .join("");

  const providerLabel =
    storageData.storageProvider === "mock"
      ? "Mock Storage（ローカル）"
      : escapeHtml(storageData.storageProvider || "mock");

  return `
    <section class="storage-status-card" aria-label="QNAP状態">
      <div class="storage-status-row">
        <span class="storage-status-label">QNAP状態</span>
        <span class="storage-status-value">${statusLine}</span>
      </div>
      <div class="storage-path-label">保存先パス</div>
      <div class="storage-path">${folderPath}</div>
      <div class="storage-provider-hint">保存先: ${providerLabel}</div>
      <div class="storage-qnap-actions" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.75rem;">
        <button type="button" class="storage-action-btn primary" id="btn-qnap-sync-project" style="min-height:48px;">案件まとめて保存</button>
        <button type="button" class="storage-action-btn" id="btn-qnap-retry-failed" style="min-height:48px;">失敗分を再試行</button>
      </div>
    </section>
    <h3 class="section-sub">書類</h3>
    <div class="storage-file-list">${docRows}</div>
    <h3 class="section-sub">ファイルを追加</h3>
    <div class="storage-upload-row">
      <button type="button" class="storage-upload-btn" id="btn-upload-photos">写真を追加</button>
      <button type="button" class="storage-upload-btn" id="btn-upload-drawings">図面を追加</button>
      <button type="button" class="storage-upload-btn" id="btn-upload-others">その他を追加</button>
    </div>
    <input type="file" id="input-upload-photos" accept="image/*" multiple hidden />
    <input type="file" id="input-upload-drawings" accept="image/*,.pdf,application/pdf" multiple hidden />
    <input type="file" id="input-upload-others" multiple hidden />
    <h3 class="section-sub">案件フォルダ</h3>
    <div class="storage-folder-tree">${folderBlocks}</div>`;
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

async function documentsApi(projectId) {
  const token = getCustomerToken();
  const res = await fetch(`${DOCUMENTS_API}/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderDocumentsTab() {
  if (!documentsData) {
    return `<p class="section-hint">読み込み中…</p>`;
  }
  const folders = documentsData.folders ?? [];
  if (!folders.length) {
    return `<p class="section-hint">書類がありません</p>
      <p class="link-row"><a href="/documents-v1?projectId=${encodeURIComponent(detail.project.id)}">Document Center で追加 →</a></p>`;
  }
  const blocks = folders
    .map((folder) => {
      const items = (folder.items ?? [])
        .slice(0, 5)
        .map(
          (item) => `<div class="storage-file-row">
            <span class="storage-file-icon">${folder.icon}</span>
            <div class="storage-file-body">
              <div class="storage-file-name">${escapeHtml(item.title)}</div>
              <div class="storage-file-meta">${escapeHtml(item.fileName)}
                ${item.qnapStatusIcon ? ` · ${item.qnapStatusIcon}${escapeHtml(item.qnapStatusLabel || "")}` : ""}
              </div>
            </div>
          </div>`
        )
        .join("");
      const more = folder.count > 5 ? `<p class="section-hint">他 ${folder.count - 5} 件</p>` : "";
      return `<h3 class="section-sub">${folder.icon} ${escapeHtml(folder.label)}（${folder.count}）</h3>
        <div class="storage-file-list">${items}</div>${more}`;
    })
    .join("");
  return `
    <p class="section-hint">書類 ${documentsData.totalDocuments} 件 — Document Center と同じデータ</p>
    ${blocks}
    <p class="link-row" style="margin-top:0.75rem">
      <a class="primary" href="/documents-v1?projectId=${encodeURIComponent(detail.project.id)}">Document Center で開く →</a>
    </p>`;
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
    case "specification":
      return renderSpecificationTab();
    case "estimate":
      return renderEstimateTab();
    case "invoice":
      return renderInvoiceTab();
    case "completion":
      return renderCompletionTab();
    case "documents":
      return renderDocumentsTab();
    case "photos":
      return renderPhotosTab();
    case "automation-tasks":
      return renderAutomationTasksTab();
    case "automation-tools":
      return renderAutomationToolsTab();
    case "automation-photos":
      return renderAutomationPhotosTab();
    default:
      return "";
  }
}

function render() {
  const root = document.getElementById("detail-root");
  if (!detail || !root) return;
  const p = detail.project;
  const tabsHtml = TABS.map((t) => {
    const badge = tabBadgeForTab(t.id);
    const badgeHtml = badge ? `<span class="tab-badge">${badge}</span>` : "";
    return `<button type="button" class="detail-tab${activeTab === t.id ? " active" : ""}" data-tab="${t.id}">${t.label}${badgeHtml}</button>`;
  }).join("");

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
      if (activeTab === "documents" && !documentsData) {
        try {
          documentsData = await documentsApi(detail.project.id);
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

  root.querySelectorAll(".next-action-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const href = btn.getAttribute("data-next-href");
      const tab = btn.getAttribute("data-next-tab");
      if (href) {
        window.location.href = href;
        return;
      }
      if (tab) {
        activeTab = tab;
        render();
        bindActions();
      }
    });
  });

  bindActions();
}

async function refreshStorageData() {
  storageData = await storageApi(detail.project.id);
}

async function shareStoragePdf(pdfKind, fileName) {
  const projectId = detail.project.id;
  const fetchUrl = pdfFileUrl(projectId, pdfKind);
  try {
    await sharePdfAsFile({
      fetchUrl,
      fileName: fileName || `${pdfKind}.pdf`,
      title: `書類 — TiSLY`,
      getHeaders: () => ({ Authorization: `Bearer ${getCustomerToken()}` }),
      toast,
    });
    await fetch(`${ESTIMATE_API}/projects/${encodeURIComponent(projectId)}/pdf-share-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getCustomerToken()}`,
      },
      body: JSON.stringify({ documentKind: pdfKind, fileName: fileName || `${pdfKind}.pdf` }),
    }).catch(() => {});
    const refreshed = await api(`/projects/${encodeURIComponent(projectId)}`);
    detail = refreshed.detail;
    if (activeTab === "history") render();
  } catch (e) {
    if (e?.name === "AbortError") return;
    toast(e.message || "共有に失敗しました");
  }
}

async function resaveStorageDocument(kind, btn) {
  if (!confirm("PDFを再生成して保存し直しますか？")) return;
  const prev = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "処理中…";
  }
  try {
    await storagePost(detail.project.id, "/regenerate-document", { kind });
    await refreshStorageData();
    toast("保存し直しました");
    render();
  } catch (e) {
    toast(e.message || "保存し直しに失敗しました");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || "保存し直す";
    }
  }
}

function bindDocActions() {
  document.querySelectorAll("[data-storage-share]").forEach((btn) => {
    const pdfKind = btn.getAttribute("data-storage-share");
    const fileName = btn.getAttribute("data-share-name");
    const fetchUrl = pdfFileUrl(detail.project.id, pdfKind);
    prefetchPdfForShare({
      fetchUrl,
      getHeaders: () => ({ Authorization: `Bearer ${getCustomerToken()}` }),
    });
    btn.addEventListener("click", () => shareStoragePdf(pdfKind, fileName));
  });
  document.querySelectorAll("[data-storage-resave]").forEach((btn) => {
    const kind = btn.getAttribute("data-storage-resave");
    btn.addEventListener("click", () => resaveStorageDocument(kind, btn));
  });
}

async function uploadStorageFiles(folderType, fileList, btn) {
  if (!fileList?.length) return;
  const prev = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "送信中…";
  }
  try {
    for (const file of fileList) {
      const fileBase64 = await fileToBase64(file);
      await storagePost(detail.project.id, "/upload-file", {
        folderType,
        fileName: file.name,
        fileBase64,
      });
    }
    await refreshStorageData();
    toast(`${fileList.length}件アップロードしました`);
    render();
  } catch (e) {
    toast(e.message || "アップロードに失敗しました");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
}

function bindQnapStorageActions() {
  document.getElementById("btn-qnap-sync-project")?.addEventListener("click", async (btn) => {
    const el = btn.currentTarget;
    el.disabled = true;
    try {
      const result = await qnapStorageApi(`/sync-project/${encodeURIComponent(detail.project.id)}`, {
        method: "POST",
        body: "{}",
      });
      toast(`QNAP保存 ${result.synced?.length ?? 0}件 / 失敗 ${result.failed?.length ?? 0}件`);
      await refreshStorageData();
      render();
    } catch (e) {
      toast(e.message || "QNAP保存に失敗しました");
    } finally {
      el.disabled = false;
    }
  });
  document.getElementById("btn-qnap-retry-failed")?.addEventListener("click", async (btn) => {
    const el = btn.currentTarget;
    el.disabled = true;
    try {
      const result = await qnapStorageApi("/retry-failed", {
        method: "POST",
        body: JSON.stringify({ projectId: detail.project.id }),
      });
      toast(`再試行 ${result.retried}件 — 成功 ${result.synced?.length ?? 0}件`);
      await refreshStorageData();
      render();
    } catch (e) {
      toast(e.message || "再試行に失敗しました");
    } finally {
      el.disabled = false;
    }
  });
}

function bindStorageUploads() {
  const pairs = [
    ["btn-upload-photos", "input-upload-photos", "photos"],
    ["btn-upload-drawings", "input-upload-drawings", "drawings"],
    ["btn-upload-others", "input-upload-others", "others"],
  ];
  for (const [btnId, inputId, folderType] of pairs) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) continue;
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      input.value = "";
      await uploadStorageFiles(folderType, files, btn);
    });
  }
}

function bindStorageFolders() {
  document.querySelectorAll(".storage-folder-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      const block = btn.closest(".storage-folder-block");
      const folder = block?.getAttribute("data-storage-folder");
      if (!folder) return;
      if (openStorageFolders.has(folder)) openStorageFolders.delete(folder);
      else openStorageFolders.add(folder);
      render();
      bindActions();
    });
  });
}

function bindActions() {
  document.getElementById("btn-open-history")?.addEventListener("click", () => {
    activeTab = "history";
    render();
    bindActions();
  });

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

  bindDocActions();
  bindStorageUploads();
  bindQnapStorageActions();
  bindStorageFolders();
  bindAutomationActions();
  document.querySelectorAll("[data-tl-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      timelineFilter = btn.getAttribute("data-tl-filter") || "all";
      saveTimelineFilterState(detail?.project?.id);
      render();
      bindActions();
    });
  });
  const tlSearch = document.getElementById("tl-search-input");
  if (tlSearch) {
    tlSearch.addEventListener("input", () => {
      timelineSearchQuery = tlSearch.value;
      saveTimelineFilterState(detail?.project?.id);
      render();
      bindActions();
    });
  }
  document.querySelectorAll("[data-tl-expand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.getAttribute("aria-disabled") === "true") return;
      const id = btn.getAttribute("data-tl-expand");
      if (!id) return;
      if (expandedTimelineIds.has(id)) expandedTimelineIds.delete(id);
      else expandedTimelineIds.add(id);
      render();
      bindActions();
    });
  });
}

function bindAutomationActions() {
  document.querySelectorAll(".auto-task-check").forEach((el) => {
    el.addEventListener("change", async () => {
      const taskId = el.getAttribute("data-task-id");
      if (!taskId || !detail?.project?.id) return;
      try {
        await automationApi(`/projects/${detail.project.id}/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ done: el.checked }),
        });
        await refreshAutomation();
        render();
        bindActions();
      } catch (e) {
        toast(e.message);
        el.checked = !el.checked;
      }
    });
  });
  document.querySelectorAll(".auto-tool-check").forEach((el) => {
    el.addEventListener("change", async () => {
      const toolId = el.getAttribute("data-tool-id");
      if (!toolId || !detail?.project?.id) return;
      try {
        await automationApi(`/projects/${detail.project.id}/tools/${toolId}`, {
          method: "PATCH",
          body: JSON.stringify({ checked: el.checked }),
        });
        await refreshAutomation();
        render();
        bindActions();
      } catch (e) {
        toast(e.message);
        el.checked = !el.checked;
      }
    });
  });
  document.querySelectorAll("[data-task-memo]").forEach((el) => {
    el.addEventListener("change", async () => {
      const taskId = el.getAttribute("data-task-memo");
      if (!taskId || !detail?.project?.id) return;
      try {
        await automationApi(`/projects/${detail.project.id}/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ memo: el.value.trim() || null }),
        });
        await refreshAutomation();
      } catch (e) {
        toast(e.message);
      }
    });
  });
  document.querySelectorAll("[data-tool-memo]").forEach((el) => {
    el.addEventListener("change", async () => {
      const toolId = el.getAttribute("data-tool-memo");
      if (!toolId || !detail?.project?.id) return;
      try {
        await automationApi(`/projects/${detail.project.id}/tools/${toolId}`, {
          method: "PATCH",
          body: JSON.stringify({ memo: el.value.trim() || null }),
        });
        await refreshAutomation();
      } catch (e) {
        toast(e.message);
      }
    });
  });
  document.querySelectorAll("[data-tool-forgot]").forEach((el) => {
    el.addEventListener("change", async () => {
      const toolId = el.getAttribute("data-tool-forgot");
      if (!toolId || !detail?.project?.id) return;
      try {
        await automationApi(`/projects/${detail.project.id}/tools/${toolId}`, {
          method: "PATCH",
          body: JSON.stringify({ forgottenMemo: el.value.trim() || null }),
        });
        await refreshAutomation();
      } catch (e) {
        toast(e.message);
      }
    });
  });
  $("auto-tasks-incomplete")?.addEventListener("change", (e) => {
    autoTasksIncompleteOnly = e.target.checked;
    render();
    bindActions();
  });
  $("auto-tasks-collapse")?.addEventListener("change", (e) => {
    autoTasksCollapseDone = e.target.checked;
    render();
    bindActions();
  });
  $("auto-tools-incomplete")?.addEventListener("change", (e) => {
    autoToolsIncompleteOnly = e.target.checked;
    render();
    bindActions();
  });
  $("btn-auto-task-add")?.addEventListener("click", async () => {
    const label = $("auto-task-add-input")?.value?.trim();
    if (!label || !detail?.project?.id) return;
    try {
      await automationApi(`/projects/${detail.project.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      $("auto-task-add-input").value = "";
      await refreshAutomation();
      render();
      bindActions();
    } catch (e) {
      toast(e.message);
    }
  });
  $("btn-auto-tool-add")?.addEventListener("click", async () => {
    const label = $("auto-tool-add-input")?.value?.trim();
    if (!label || !detail?.project?.id) return;
    try {
      await automationApi(`/projects/${detail.project.id}/tools`, {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      $("auto-tool-add-input").value = "";
      await refreshAutomation();
      render();
      bindActions();
    } catch (e) {
      toast(e.message);
    }
  });
  document.querySelectorAll(".ai-dismiss-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-suggestion-id");
      if (!id || !detail?.project?.id) return;
      try {
        await automationApi(`/projects/${detail.project.id}/suggestions/${id}/dismiss`, {
          method: "PATCH",
          body: "{}",
        });
        await refreshAutomation();
        render();
        bindActions();
      } catch (e) {
        toast(e.message);
      }
    });
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
      window.location.href = resolveDashboardReturnUrl();
    },
  });

  detail = await api(`/projects/${encodeURIComponent(projectId)}`);
  ensureTimelineProjectState(projectId);
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab && TABS.some((t) => t.id === tab)) activeTab = tab;
  if (activeTab === "files") {
    try {
      storageData = await storageApi(projectId);
    } catch {
      /* tab will show loading hint */
    }
  }
  if (activeTab === "documents") {
    try {
      documentsData = await documentsApi(projectId);
    } catch {
      /* tab will show loading hint */
    }
  }
  render();
}

main().catch((e) => toast(e.message));
