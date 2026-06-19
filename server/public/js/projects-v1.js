import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import { sharePdfAsFile, prefetchPdfForShare } from "./pdf-share-v1.js";

const API = "/api/projects/v1";
const WORK_API = "/api/work-session/v1";
import { bindWorkSessionPanels, renderWorkSessionPanel } from "./work-session-ui.js";
import {
  bindFieldChecklistPanel,
  confirmSpecificationPhotoSlotsBeforeReport,
  loadFieldChecklist,
  renderFieldChecklistPanel,
  renderFieldChecklistStatusSummary,
} from "./field-checklist-ui.js";

const STAGE_ORDER = [
  "survey",
  "estimate",
  "ordered",
  "field_check",
  "purchase",
  "construction",
  "work_done",
  "invoice",
  "payment",
];
const STAGE_LABELS = {
  survey: "現調",
  estimate: "見積",
  ordered: "受注",
  field_check: "材料チェック",
  purchase: "発注",
  construction: "施工中",
  work_done: "完了",
  invoice: "請求",
  payment: "入金",
};

// --- 案件 PDF 書類 UI ---
// ローカル PDF + QNAP バックアップ状態（管理者のみエラー詳細）
const PDF_KIND_TO_DOC_VIEW = {
  specification: "specification",
  estimate: "estimate",
  report: "completion-report",
  invoice: "invoice",
};

const PDF_KIND_ORDER = ["specification", "estimate", "report", "invoice"];

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
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

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

async function workApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

let currentDetailRef = null;
let pendingDeleteRef = null;
let practicalNavRef = null;
let listTab = "active";
let pdfListIsAdmin = false;
let pdfQnapBackupEnabled = false;

function pipelineBarHtml(pipeline, { compact = false } = {}) {
  return STAGE_ORDER.map((s) => {
    const st = pipeline[s] ?? "pending";
    const icon = st === "done" ? "✅" : st === "active" ? "🔵" : "○";
    return `<div class="pipeline-step ${st}${compact ? " compact" : ""}" title="${STAGE_LABELS[s]}">
      <span class="step-icon">${icon}</span>
      <span class="step-label">${STAGE_LABELS[s]}</span>
    </div>`;
  }).join("");
}

function showList() {
  $("view-list").classList.remove("hidden");
  $("view-detail").classList.add("hidden");
  practicalNavRef?.setBackHandler(() => {
    window.location.href = "/app";
  });
}

function showDetail() {
  $("view-list").classList.add("hidden");
  $("view-detail").classList.remove("hidden");
  practicalNavRef?.setBackHandler(() => {
    showList();
    history.replaceState({}, "", "/projects-v1");
    loadList();
  });
}

function documentViewerHref(projectId, kind) {
  const params = new URLSearchParams({
    projectId,
    kind,
    return: `${window.location.pathname}${window.location.search}`,
  });
  return `/document-viewer-v1.html?${params}`;
}

function pdfFileUrl(projectId, kind) {
  const token = getCustomerToken();
  return `${API}/projects/${encodeURIComponent(projectId)}/pdfs/${encodeURIComponent(kind)}/file?access_token=${encodeURIComponent(token)}`;
}

function pdfShareUrl(projectId, kind) {
  const token = getCustomerToken();
  return `${window.location.origin}${API}/projects/${encodeURIComponent(projectId)}/pdfs/${encodeURIComponent(kind)}/file?access_token=${encodeURIComponent(token)}`;
}

async function sharePdf(projectId, kind, label, fileName) {
  const fetchUrl = pdfFileUrl(projectId, kind);
  try {
    await sharePdfAsFile({
      fetchUrl,
      fileName: fileName || `${kind}.pdf`,
      title: `${label} — TiSLY`,
      getHeaders: () => ({ Authorization: `Bearer ${getCustomerToken()}` }),
      toast,
    });
  } catch (e) {
    if (e?.name === "AbortError") return;
    toast(e.message || "共有に失敗しました");
  }
}

function renderPdfRow(projectId, pdf) {
  const openKind = PDF_KIND_TO_DOC_VIEW[pdf.kind] || pdf.kind;
  const openHref = documentViewerHref(projectId, openKind);
  const hasFile = pdf.exists;
  const primaryLabel = hasFile ? "開く" : "未作成";
  const primaryClass = hasFile ? "btn-primary-action" : "";
  const primaryTag = hasFile
    ? `<a class="${primaryClass}" href="${escapeHtml(openHref)}">開く</a>`
    : `<span class="pdf-empty">PDF未作成 — 見積PWAで生成してください</span>`;

  const localLabel = pdf.local?.label || (hasFile ? "✅ 保存済み" : "未保存");
  const qnap = pdf.qnap || {};
  const qnapLabel = qnap.label || (pdfQnapBackupEnabled ? "待機中" : "未設定");
  const showResync = hasFile && qnap.status === "failed";
  const qnapErrorHtml =
    pdfListIsAdmin && qnap.error
      ? `<div class="pdf-qnap-error">${escapeHtml(qnap.error)}</div>`
      : "";

  return `<article class="pdf-row" data-pdf-kind="${escapeHtml(pdf.kind)}">
    <div class="pdf-row-head">
      <strong>${escapeHtml(pdf.label)}</strong>
      <span class="section-hint">${escapeHtml(pdf.fileName || "—")}</span>
    </div>
    <div class="pdf-meta">
      <div>作成: ${escapeHtml(formatDateTime(pdf.createdAt))}</div>
      <div>サイズ: ${escapeHtml(formatSize(pdf.sizeBytes))}</div>
      <div>更新: ${escapeHtml(formatDateTime(pdf.updatedAt))}</div>
    </div>
    <div class="pdf-storage-status">
      <div>ローカル: <span class="pdf-local-ok">${escapeHtml(localLabel)}</span></div>
      <div>QNAP: <span class="pdf-qnap-label pdf-qnap-${escapeHtml(qnap.status || "none")}">${escapeHtml(qnapLabel)}</span></div>
      ${qnapErrorHtml}
    </div>
    <div class="pdf-actions">
      ${primaryTag}
      ${hasFile ? `<button type="button" data-pdf-action="share">共有</button>` : ""}
      ${hasFile ? `<button type="button" data-pdf-action="regenerate">再生成</button>` : ""}
      ${showResync ? `<button type="button" data-pdf-action="qnap-resync">QNAPへ再同期</button>` : ""}
      ${hasFile ? `<button type="button" class="btn-danger" data-pdf-action="delete">削除</button>` : ""}
    </div>
  </article>`;
}

async function loadProjectPdfs(projectId) {
  try {
    return await api(`/projects/${encodeURIComponent(projectId)}/pdfs`);
  } catch {
    return { pdfs: [], storageBasePath: "", storageProvider: "local" };
  }
}

/** 案件詳細「書類」セクション — local PDF の一覧・共有・再生成・削除 */
async function renderDetailDocuments(detail) {
  const mount = $("detail-documents");
  if (!mount) return;
  const p = detail.project;
  if (p.source !== "business") {
    mount.classList.add("hidden");
    mount.innerHTML = "";
    return;
  }
  mount.classList.remove("hidden");
  mount.innerHTML = "<p class='section-hint'>読み込み中…</p>";
  const data = await loadProjectPdfs(p.id);
  pdfListIsAdmin = Boolean(data.isAdmin);
  pdfQnapBackupEnabled = Boolean(data.qnapBackupEnabled);
  const pdfsRaw = data.pdfs || [];
  const pdfs = PDF_KIND_ORDER.map((kind) => pdfsRaw.find((p) => p.kind === kind)).filter(Boolean).filter((pdf) => {
    if (pdf.kind === "invoice") {
      const pipeline = p.pipeline || {};
      return pipeline.invoice === "done" || pipeline.invoice === "active";
    }
    return true;
  });
  if (!pdfs.length) {
    mount.innerHTML = `<div class="spec-create-row"><button type="button" class="btn-doc-action" id="btn-create-specification">仕様書作成（PDF自動保存）</button></div><p class='pdf-empty'>書類がありません</p>`;
    $("btn-create-specification")?.addEventListener("click", async () => {
      try {
        const created = await createSpecificationPdf(p.id);
        if (!created) return;
        toast("仕様書PDFを保存しました");
        await renderDetailDocuments(detail);
      } catch (e) {
        toast(e.message || "仕様書の作成に失敗しました");
      }
    });
    return;
  }
  const specPdf = pdfs.find((x) => x.kind === "specification");
  const specCreateHtml =
    specPdf && !specPdf.exists
      ? `<div class="spec-create-row"><button type="button" class="btn-doc-action" id="btn-create-specification">仕様書作成（PDF自動保存）</button></div>`
      : "";
  mount.innerHTML = `${specCreateHtml}<p class="section-hint" style="margin-top:0;">保存先: ${escapeHtml(data.storageBasePath || `uploads/business/${p.id}/pdfs/`)}</p><div class="doc-tabs">${pdfs.map((pdf) => `<button type="button" class="doc-tab${pdf.exists ? "" : " doc-tab-empty"}" data-doc-tab="${escapeHtml(pdf.kind)}">${escapeHtml(pdf.label)}</button>`).join("")}</div><div id="doc-tab-panels">${pdfs.map((pdf) => `<div class="doc-tab-panel hidden" data-doc-panel="${escapeHtml(pdf.kind)}">${renderPdfRow(p.id, pdf)}</div>`).join("")}</div>`;
  $("btn-create-specification")?.addEventListener("click", async () => {
    try {
      const created = await createSpecificationPdf(p.id);
      if (!created) return;
      toast("仕様書PDFを保存しました");
      await renderDetailDocuments(detail);
    } catch (e) {
      toast(e.message || "仕様書の作成に失敗しました");
    }
  });
  const panels = mount.querySelectorAll(".doc-tab-panel");
  const tabs = mount.querySelectorAll(".doc-tab");
  function activateTab(kind) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.docTab === kind));
    panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.docPanel !== kind));
  }
  if (tabs.length) activateTab(tabs[0].dataset.docTab);
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.docTab));
  });
  mount.querySelectorAll(".pdf-row").forEach((row) => {
    const kind = row.dataset.pdfKind;
    const shareBtn = row.querySelector('[data-pdf-action="share"]');
    const label = pdfs.find((x) => x.kind === kind)?.label || kind;
    const fileName = pdfs.find((x) => x.kind === kind)?.fileName;
    const shareFetchUrl = () => pdfFileUrl(p.id, kind);
    shareBtn?.addEventListener(
      "touchstart",
      () => {
        prefetchPdfForShare({
          fetchUrl: shareFetchUrl(),
          getHeaders: () => ({ Authorization: `Bearer ${getCustomerToken()}` }),
        }).catch(() => {});
      },
      { passive: true }
    );
    shareBtn?.addEventListener("click", () => {
      sharePdf(p.id, kind, label, fileName);
    });
    row.querySelector('[data-pdf-action="regenerate"]')?.addEventListener("click", async () => {
      if (!confirm(`${pdfs.find((x) => x.kind === kind)?.label || kind}PDFを再生成しますか？`)) return;
      try {
        await api(`/projects/${encodeURIComponent(p.id)}/pdfs/${encodeURIComponent(kind)}/regenerate`, {
          method: "POST",
          body: "{}",
        });
        toast("PDFを再生成しました");
        await renderDetailDocuments(detail);
      } catch (e) {
        toast(e.message || "再生成に失敗しました");
      }
    });
    row.querySelector('[data-pdf-action="qnap-resync"]')?.addEventListener("click", async () => {
      try {
        await api(`/projects/${encodeURIComponent(p.id)}/pdfs/${encodeURIComponent(kind)}/qnap-resync`, {
          method: "POST",
          body: "{}",
        });
        toast("QNAP再同期を実行しました");
        await renderDetailDocuments(detail);
      } catch (e) {
        toast(e.message || "QNAP再同期に失敗しました");
      }
    });
    row.querySelector('[data-pdf-action="delete"]')?.addEventListener("click", async () => {
      if (!confirm("このPDFファイルを削除しますか？")) return;
      try {
        await api(`/projects/${encodeURIComponent(p.id)}/pdfs/${encodeURIComponent(kind)}`, { method: "DELETE" });
        toast("PDFを削除しました");
        await renderDetailDocuments(detail);
      } catch (e) {
        toast(e.message || "削除に失敗しました");
      }
    });
  });
}

function renderTodayDeparture(todayDeparture) {
  const el = $("today-departure-card");
  if (!el) return;
  if (!todayDeparture) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const href = todayDeparture.fieldCheckUrl || "/field-check-v1";
  el.classList.remove("hidden");
  el.innerHTML = `<div class="friendly-card today-departure-card">
    <p class="section-label" style="margin-top:0;">🚐 今日の出発</p>
    <p>🚐 出発 <strong>${escapeHtml(todayDeparture.departureTime)}</strong></p>
    <p>🔔 材料チェック通知 <strong>${escapeHtml(todayDeparture.reminderTime)}</strong>${todayDeparture.reminderEnabled ? "" : "（OFF）"}</p>
    ${todayDeparture.eventTitle ? `<p class="section-hint">${escapeHtml(todayDeparture.eventTitle)}</p>` : ""}
    <a class="btn-sub" href="${escapeHtml(href)}" style="display:inline-block;margin-top:0.35rem;">材料チェックを開く</a>
  </div>`;
}

function renderDashboard(cards) {
  const grid = $("dashboard-grid");
  if (!cards?.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = cards
    .map(
      (c) => `<a href="${escapeHtml(c.href)}" class="dashboard-card" style="border-top:3px solid ${escapeHtml(c.themeColor)}">
        <div class="dash-count">${c.count}</div>
        <div class="dash-label">${escapeHtml(c.label)}</div>
      </a>`
    )
    .join("");
}

function renderList(projects) {
  if (!projects.length) {
    $("project-list").innerHTML = "<p>案件がありません</p>";
    return;
  }
  $("project-list").innerHTML = projects
    .map(
      (p) => `<article class="friendly-card project-card" data-id="${escapeHtml(p.id)}" data-source="${escapeHtml(p.source)}" data-has-estimate="${p.hasEstimate ? "1" : "0"}" data-has-invoice="${p.hasInvoice ? "1" : "0"}" data-title="${escapeHtml(p.title)}" role="button" tabindex="0">
        <div class="list-card-actions">
          <button type="button" class="list-card-action" data-action="delete" title="案件を削除">🗑</button>
        </div>
        <p><strong>${escapeHtml(p.projectNo)}</strong> ${escapeHtml(p.title)}</p>
        <p class="section-hint">${escapeHtml(p.customerName)}</p>
        <p class="section-hint">📍 ${escapeHtml(p.address || "—")}</p>
        <p><span class="status-badge">${escapeHtml(p.statusLabel)}</span></p>
        <div class="pipeline-bar">${pipelineBarHtml(p.pipeline, { compact: true })}</div>
      </article>`
    )
    .join("");
  bindProjectCards($("project-list"));
}

function renderDeletedList(projects) {
  const mount = $("deleted-list");
  if (!projects.length) {
    mount.innerHTML = "<p>削除済み案件はありません</p>";
    return;
  }
  mount.innerHTML = projects
    .map(
      (p) => `<article class="friendly-card deleted-card" data-id="${escapeHtml(p.id)}" data-source="${escapeHtml(p.source)}">
        <p><strong>${escapeHtml(p.projectNo)}</strong> ${escapeHtml(p.title)}</p>
        <p class="section-hint">${escapeHtml(p.customerName)}</p>
        <p class="section-hint">削除: ${escapeHtml(formatDateTime(p.deletedAt))}</p>
        <p class="section-hint">見積:${p.estimateCount} / 請求:${p.invoiceCount} / PDF:${p.pdfCount}</p>
        <button type="button" class="btn-sub" data-action="restore" style="margin-top:0.45rem;width:100%;">復元</button>
      </article>`
    )
    .join("");
  mount.querySelectorAll('[data-action="restore"]').forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const card = btn.closest(".deleted-card");
      if (!card) return;
      try {
        await api(`/projects/${encodeURIComponent(card.dataset.id)}/restore?source=${encodeURIComponent(card.dataset.source)}`, {
          method: "POST",
          body: "{}",
        });
        toast("案件を復元しました");
        await loadDeletedList();
        await loadList();
      } catch (e) {
        toast(e.message || "復元に失敗しました");
      }
    });
  });
}

function bindProjectCards(container) {
  container.querySelectorAll(".project-card").forEach((card) => {
    const open = () => openDetail(card.dataset.id, card.dataset.source);
    card.addEventListener("click", (ev) => {
      if (ev.target.closest(".list-card-action")) return;
      open();
    });
    card.addEventListener("keydown", (ev) => {
      if (ev.target.closest(".list-card-action")) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
    card.querySelector('[data-action="delete"]')?.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await showDeleteDialog(card.dataset);
    });
  });
}

function hideDeleteDialog() {
  $("delete-dialog-overlay").classList.add("hidden");
  pendingDeleteRef = null;
}

async function showDeleteDialog(dataset) {
  const { id, source } = dataset;
  try {
    const preview = await api(`/projects/${encodeURIComponent(id)}/delete-preview?source=${encodeURIComponent(source)}`);
    pendingDeleteRef = { id, source };
    $("delete-dialog-body").innerHTML = `
      <p><strong>案件：</strong>${escapeHtml(preview.projectTitle)}</p>
      <p>見積：${preview.estimateCount}</p>
      <p>請求：${preview.invoiceCount}</p>
      <p>PDF：${preview.pdfCount}</p>
      <p style="margin-top:0.65rem;">本当に削除しますか？</p>`;
    $("delete-dialog-overlay").classList.remove("hidden");
  } catch (e) {
    toast(e.message || "削除情報の取得に失敗しました");
  }
}

async function confirmDeleteProject() {
  if (!pendingDeleteRef) return;
  const { id, source } = pendingDeleteRef;
  hideDeleteDialog();
  try {
    await api(`/projects/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`, { method: "DELETE" });
    toast("案件を削除しました");
    if (currentDetailRef?.id === id) {
      showList();
      history.replaceState({}, "", "/projects-v1");
      currentDetailRef = null;
    }
    await loadList();
  } catch (e) {
    toast(e.message || "削除に失敗しました");
  }
}

async function createSpecificationPdf(projectId) {
  const token = getCustomerToken();
  const apiFetch = async (path, opts = {}) => {
    const res = await fetch(path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };
  const ok = await confirmSpecificationPhotoSlotsBeforeReport(apiFetch, { projectId });
  if (!ok) return false;
  await api(`/projects/${encodeURIComponent(projectId)}/specification/create`, {
    method: "POST",
    body: "{}",
  });
  return true;
}

async function workApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${WORK_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setDetailTab(tab) {
  document.querySelectorAll(".detail-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.detailTab === tab);
  });
  document.querySelectorAll(".detail-tab-panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== `detail-panel-${tab}`);
  });
}

async function renderDetailChecklistOverview(detail) {
  const mount = $("detail-checklist-overview");
  if (!mount) return;
  const p = detail.project;
  const openHref = `/field-checklist-v1?projectId=${encodeURIComponent(p.id)}&source=${encodeURIComponent(p.source)}`;
  try {
    const data = await loadFieldChecklist(workApi, { projectSource: p.source, projectId: p.id });
    mount.innerHTML = renderFieldChecklistStatusSummary({
      status: data.checklistStatus,
      session: data.session,
      showOpenButton: true,
      openHref,
    });
  } catch (e) {
    mount.innerHTML = `<p class="section-hint">${escapeHtml(e.message || "読み込み失敗")}</p>`;
  }
}

async function renderDetailChecklist(detail) {
  const mount = $("detail-checklist");
  if (!mount) return;
  const p = detail.project;
  try {
    const data = await loadFieldChecklist(workApi, { projectSource: p.source, projectId: p.id });
    mount.innerHTML = renderFieldChecklistPanel({
      items: data.checklist || [],
      status: data.checklistStatus,
      showHeader: true,
      showSyncButton: true,
      forceReason: data.session?.forceCompleteReason || data.checklistStatus?.forceCompleteReason || "",
    });
    bindFieldChecklistPanel(mount, {
      apiFetch: workApi,
      toast,
      projectSource: p.source,
      projectId: p.id,
      showHeader: true,
      showSyncButton: true,
      onRefresh: async () => {
        await renderDetailChecklistOverview(detail);
      },
    });
    const link = $("link-full-checklist");
    if (link) {
      link.href = `/field-checklist-v1?projectId=${encodeURIComponent(p.id)}&source=${encodeURIComponent(p.source)}`;
    }
  } catch (e) {
    mount.innerHTML = `<p class="section-hint">${escapeHtml(e.message || "読み込み失敗")}</p>`;
  }
}

function renderDetailWorkSession(detail) {
  const mount = $("detail-work-session");
  if (!mount) return;
  const p = detail.project;
  const workDate = new Date().toISOString().slice(0, 10);
  mount.innerHTML = renderWorkSessionPanel({
    projectSource: p.source,
    projectId: p.id,
    projectTitle: p.title,
    workDate,
    session: detail.workSession,
    checklist: [],
    compact: true,
  });
  bindWorkSessionPanels(mount, {
    apiFetch: workApi,
    toast,
    onUpdated: async () => {
      if (currentDetailRef) await openDetail(currentDetailRef.id, currentDetailRef.source);
    },
  });
}

async function openDetail(id, source) {
  try {
    const detail = await api(`/projects/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`);
    currentDetailRef = { id, source };
    const p = detail.project;
    $("detail-header").innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.customerName)}</p>
      <p>📍 ${escapeHtml(p.address || "—")}</p>
      <p>番号: ${escapeHtml(p.projectNo)}</p>
      <p><span class="status-badge">${escapeHtml(p.statusLabel)}</span></p>`;
    $("detail-pipeline").innerHTML = pipelineBarHtml(p.pipeline);
    renderDetailWorkSession(detail);
    await renderDetailChecklistOverview(detail);
    await renderDetailChecklist(detail);
    await renderDetailDocuments(detail);
    $("detail-timeline").innerHTML = detail.timeline.length
      ? detail.timeline
          .map((t) => `<p><strong>${escapeHtml(t.date)}</strong> ${escapeHtml(t.label)} ${escapeHtml(t.detail)}</p>`)
          .join("")
      : "<p>履歴はまだありません</p>";
    setDetailTab("overview");
    showDetail();
    history.pushState({ projectId: id }, "", `?id=${id}&source=${source}`);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

function setListTab(tab) {
  listTab = tab;
  const active = tab === "active";
  $("tab-active").classList.toggle("active", active);
  $("tab-deleted").classList.toggle("active", !active);
  $("project-list").classList.toggle("hidden", !active);
  $("deleted-list").classList.toggle("hidden", active);
  if (!active) loadDeletedList();
}

async function loadDeletedList() {
  try {
    const data = await api("/projects/deleted");
    renderDeletedList(data.projects || []);
  } catch (e) {
    $("deleted-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function loadList() {
  try {
    const [dash, data] = await Promise.all([api("/dashboard"), api("/projects")]);
    renderTodayDeparture(dash.todayDeparture);
    renderDashboard(dash.cards || []);
    renderList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  const nav = initPracticalNav({
    appId: "projects_v1",
    appName: "現場",
    theme: "hub",
    onBack: () => {
      if (!$("view-detail")?.classList.contains("hidden")) {
        showList();
        history.replaceState({}, "", "/projects-v1");
        loadList();
        return;
      }
      window.location.href = "/app";
    },
  });
  practicalNavRef = nav;
  nav.setToast(toast);
  nav.setBackVisible(true);

  $("btn-back-list").addEventListener("click", () => {
    showList();
    history.replaceState({}, "", "/projects-v1");
  });

  $("tab-active").addEventListener("click", () => setListTab("active"));
  $("tab-deleted").addEventListener("click", () => setListTab("deleted"));
  document.querySelectorAll(".detail-tab").forEach((tab) => {
    tab.addEventListener("click", () => setDetailTab(tab.dataset.detailTab));
  });
  $("delete-dialog-cancel").addEventListener("click", hideDeleteDialog);
  $("delete-dialog-confirm").addEventListener("click", confirmDeleteProject);
  $("delete-dialog-overlay").addEventListener("click", (ev) => {
    if (ev.target === $("delete-dialog-overlay")) hideDeleteDialog();
  });

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const source = params.get("source") ?? "business";
  if (id) {
    await openDetail(id, source);
  } else {
    await loadList();
  }
}

init().catch(console.error);

export { pdfFileUrl, pdfShareUrl, sharePdf, formatDateTime, formatSize };
