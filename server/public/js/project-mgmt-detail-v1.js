import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { sharePdfAsFile, prefetchPdfForShare } from "./pdf-share-v1.js";

const API = "/api/project-mgmt/v1";
const TIMELINE_API = "/api/project-timeline-v1";
const STORAGE_API = "/api/project-storage";
const PROJECTS_API = "/api/projects/v1";
const ESTIMATE_API = "/api/estimate/v1";
const TABS = [
  { id: "overview", label: "概要" },
  { id: "survey", label: "現調" },
  { id: "estimate", label: "見積" },
  { id: "invoice", label: "請求" },
  { id: "specification", label: "仕様書" },
  { id: "completion", label: "完了報告" },
  { id: "photos", label: "写真" },
  { id: "files", label: "ファイル" },
  { id: "history", label: "履歴" },
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
let timelineFilter = "all";
let timelineSearchQuery = "";
const openStorageFolders = new Set();

const TIMELINE_FILTERS = [
  { id: "all", label: "すべて" },
  { id: "estimate", label: "見積" },
  { id: "invoice", label: "請求" },
  { id: "specification", label: "仕様書" },
  { id: "completion", label: "完了報告" },
  { id: "share", label: "共有" },
  { id: "qnap", label: "QNAP" },
  { id: "photo", label: "写真" },
];

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

function documentViewerHref(projectId, viewerKind) {
  const params = new URLSearchParams({
    projectId,
    kind: viewerKind,
    return: `${window.location.pathname}${window.location.search}`,
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
  if (projectStatus === "synced") return { icon: "🟢", label: "同期済" };
  if (projectStatus === "error") return { icon: "🔴", label: "エラー" };
  return { icon: "🟡", label: "未同期" };
}

function resolveDashboardReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("return");
  if (ret && ret.startsWith("/")) return ret;
  return "/project-dashboard-v1";
}

function renderDashboardBackLink() {
  const href = resolveDashboardReturnUrl();
  return `<a href="${escapeHtml(href)}" class="dash-back-link">← ダッシュボードへ戻る</a>`;
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
    ${renderDashboardBackLink()}
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

function timelineTimeLabel(item) {
  if (item.date?.includes(" ")) return item.date.split(" ")[1];
  const d = new Date(item.createdAt);
  if (Number.isNaN(d.getTime())) return item.date || "—";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function filterTimelineItems(items) {
  const q = timelineSearchQuery.trim().toLowerCase();
  return items.filter((e) => {
    const hay = `${e.title} ${e.detail || ""} ${e.eventType || ""}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (timelineFilter === "all") return true;
    if (e.category === timelineFilter) return true;
    if (timelineFilter === "estimate") return hay.includes("見積");
    if (timelineFilter === "invoice") return hay.includes("請求");
    if (timelineFilter === "specification") return hay.includes("仕様");
    if (timelineFilter === "share") return hay.includes("共有") || hay.includes("line");
    if (timelineFilter === "qnap") return hay.includes("qnap");
    if (timelineFilter === "completion") return hay.includes("完了");
    if (timelineFilter === "photo") return hay.includes("写真") || hay.includes("図面");
    return false;
  });
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
  const items = filterTimelineItems(detail.timeline ?? []);
  const chips = TIMELINE_FILTERS.map(
    (f) =>
      `<button type="button" class="tl-filter-chip${timelineFilter === f.id ? " active" : ""}" data-tl-filter="${f.id}">${f.label}</button>`
  ).join("");
  const searchRow = `
    <div class="tl-search-row">
      <input type="search" id="tl-search-input" class="tl-search-input" placeholder="履歴を検索（見積・請求・共有…）" value="${escapeHtml(timelineSearchQuery)}" autocomplete="off" />
    </div>
    <div class="tl-search-row tl-chip-row">${chips}</div>`;
  if (!items.length) {
    return `
      ${searchRow}
      <p class="section-hint">${timelineFilter === "all" && !timelineSearchQuery.trim() ? "履歴はまだありません" : "該当する履歴がありません"}</p>`;
  }
  const groups = groupTimelineByDate(items);
  const rows = groups
    .map((g) => {
      const groupItems = g.items
        .map(
          (e) => `
      <div class="tl-item ${timelineCategoryClass(e.category, e.eventType)}">
        <div class="tl-time">${escapeHtml(timelineTimeLabel(e))}</div>
        <div class="tl-title">${escapeHtml(e.title)}</div>
        ${e.detail ? `<div class="tl-detail">${escapeHtml(e.detail)}</div>` : ""}
      </div>`
        )
        .join("");
      return `
      <section class="tl-date-group">
        <h4 class="tl-date-heading">${escapeHtml(g.dateLabel)}</h4>
        <div class="timeline-list">${groupItems}</div>
      </section>`;
    })
    .join("");
  return `
    ${searchRow}
    ${rows}
    <p class="tl-count-hint">${items.length}件</p>`;
}

function findPdfEntry(pdfKind) {
  return (detail.documents || []).find((d) => d.kind === pdfKind);
}

function renderDocTabActions(pdfKind, viewerKind, storageKind) {
  const entry = findPdfEntry(pdfKind);
  if (!entry?.exists) {
    return `<p class="storage-file-empty">PDF未保存 — 作成後にここから開けます</p>`;
  }
  const displayName = entry.fileName || `${pdfKind}.pdf`;
  const resaveKind = storageKind || pdfKind;
  return `
    <div class="storage-file-actions doc-tab-actions">
      <a class="storage-action-btn primary" href="${escapeHtml(documentViewerHref(detail.project.id, viewerKind))}">開く</a>
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
    ${renderDocTabActions("specification", "specification", "specification")}
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
    ${renderDocTabActions("estimate", "estimate", "estimate")}
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
    ${renderDocTabActions("invoice", "invoice", "invoice")}
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
    ${renderDocTabActions("report", "completion-report", "report")}
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
      const status = `${doc.saveStatusIcon || "🟡"} ${escapeHtml(doc.saveStatusLabel || "未保存")} · ${qnap.icon} QNAP ${escapeHtml(qnap.label)}`;
      const canOpen = saved || doc.hasLocalPdf;
      const actions = canOpen
        ? `
      <div class="storage-file-actions">
        <a class="storage-action-btn primary" href="${escapeHtml(documentViewerHref(projectId, doc.viewerKind))}">開く</a>
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
  bindStorageFolders();
  document.querySelectorAll("[data-tl-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      timelineFilter = btn.getAttribute("data-tl-filter") || "all";
      render();
      bindActions();
    });
  });
  const tlSearch = document.getElementById("tl-search-input");
  if (tlSearch) {
    tlSearch.addEventListener("input", () => {
      timelineSearchQuery = tlSearch.value;
      render();
      bindActions();
    });
  }
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
