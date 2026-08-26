import {
  customerCodeFromPath,
  fetchCustomerSession,
  getCustomerToken,
  redirectToPortalLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { navigatePracticalReturn, navigateTo } from "./tisly-return-nav-v1.js";
import { getDefaultNavFallbackV1, navigateBackOne } from "./tisly-navigation-stack-v1.js";
import { resolveProjectDisplayName } from "./project-display-name.js";
import { friendlyHttpError, renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import { confirmChecklistBeforeReport, confirmCompletionPhotoSlotsBeforeReport } from "./field-checklist-ui.js?v=fc-ui-v3";
import { clearPrefetchPdfCache, prefetchPdfForShare, sharePdfAsFile, triggerDownload } from "./pdf-share-v1.js?v=pdf-share-v2";
import {
  createLoadWatchdog,
  fetchJson,
  withTimeout,
} from "./tisly-fetch-v1.js";
import { cacheGet, cacheMeta, cacheSet } from "./tisly-data-cache-v1.js";
import {
  enqueueOfflineSyncV1,
  isOnlineV1,
} from "./tisly-offline-core-v1.js";
import {
  mountVoiceInputButtonV1,
  parseEstimateSpeechLinesV1,
} from "./tisly-voice-input-v1.js";
import {
  documentNasSaveSuccessMessage,
  documentNasPdfSaveSuccessMessage,
  documentNasPdfSavePendingMessage,
  documentNasPdfSaveRequestSentMessage,
  getStoredDocumentNasHost,
  setStoredDocumentNasPort,
  DOCUMENT_NAS_HOST,
} from "./qnap-client-direct-v1.js";

let practicalNav = null;
let currentView = "list";
let currentSurveyProjectId = null;
let pdfBlobUrl = null;
let selectionMode = false;
const selectedIds = new Set();
/** @type {Map<string, object>} */
const listProjectById = new Map();
/** @type {string[]} */
let pendingDeleteIds = [];
let bulkDeleteInProgress = false;

const API = "/api/estimate/v1";
const PROJECTS_API = "/api/projects/v1";
const WORK_API = "/api/work-session/v1";
const AUTOMATION_API = "/api/project-automation/v1";
let currentProjectId = null;
let currentMasterDraftId = null;
let currentMasterPricingSummary = null;
let currentLines = [];
let currentCustomerName = "";
let priceRulePresets = [];
let currentPriceRule = null;
let lastTomsData = null;
let hasInvoice = false;
let standaloneMode = "estimate";
let lineTemplates = [];
let customerSuggestTimer = null;
let completionPhotos = [];
let completionPendingPreviewUrls = [];
let documentsStatus = null;
let documentsStatusTimer = null;
let prefetchInFlight = null;
const completionTitleTimers = new Map();
const completionTitleLastSaved = new Map();
const COMPLETION_TITLE_SAVE_OK = "タイトルを保存しました";
const MAX_COMPLETION_PHOTOS = 30;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const COMPLETION_PHOTO_FAIL_MSG = "写真の形式か容量で失敗しました。別の写真で試してください";
export const ESTIMATE_UI_VERSION = "estimate-ui-v20";
/** 一覧・初期化のタイムアウト（短めにして無限ローディングを防ぐ） */
const INIT_LOAD_TIMEOUT_MS = 12_000;
const BOOTSTRAP_WATCHDOG_MS = 10_000;
/**
 * 緊急修復: 入力変更時の即時自動保存は UI フリーズの原因になるため無効。
 * 日付・ヘッダーは「ヘッダーを保存」ボタン（および確定/請求作成時の明示保存）のみ。
 */
const ENABLE_HEADER_DATE_AUTOSAVE = false;
const LOCAL_DRAFTS_KEY = "tisly_estimate_local_drafts_v1";
const PENDING_SAVE_PREFIX = "tisly_estimate_pending_v1:";
/** TOMS 見積履歴の localStorage ミラー */
const TOMS_HISTORY_LOCAL_KEY = "tisly_toms_estimate_history_v1";
const TOMS_COMPANY_NAME = "株式会社TOMS";
const TOMS_DEFAULT_BANK_INFO = "常陽銀行 越谷支店\n普通 1370414\nトムズ";
const FETCH_FAIL_HINT = "データの取得に失敗しました。再読み込みするか、手動で新規作成できます。";

let authSession = null;
let bootstrapWatchdog = null;
let bootstrapInFlight = false;

const $ = (id) => document.getElementById(id);

function setLoadStage(stage) {
  const el = $("estimate-load-debug");
  if (el) el.textContent = stage || "";
}

function readUrlProjectId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("project") || params.get("projectId") || params.get("ref") || "";
}

function readInitialListTab() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "invoice") return "invoices";
  if (tab === "projects") return "projects";
  if (tab === "pending") return "pending";
  return null;
}

function clearListLoading(el, fallbackHtml) {
  if (!el) return;
  if (el.textContent?.includes("読み込み中")) {
    el.innerHTML = fallbackHtml;
  }
}

function forceClearAllListLoading(failed = false) {
  const hint = failed
    ? `<p class="section-hint">${FETCH_FAIL_HINT}</p>`
    : '<p class="section-hint">データがありません</p>';
  clearListLoading(
    $("pending-list"),
    `<div class="empty-icon">💰</div><p>見積待ちの案件はありません</p>${hint}`
  );
  clearListLoading(
    $("project-list"),
    `<div class="empty-icon">📋</div><p>まだ見積がありません</p>${hint}`
  );
  clearListLoading(
    $("invoice-list"),
    `<div class="empty-icon">🧾</div><p>請求書はまだありません</p>${hint}`
  );
  const mount = $("doc-list-mount");
  if (mount?.textContent?.includes("読み込み中")) {
    mount.innerHTML = failed
      ? `<p class="section-hint">${FETCH_FAIL_HINT}</p>`
      : '<p class="section-hint">書類がありません</p>';
  }
}

function showStatusBanner(message, kind = "warn") {
  const banner = $("estimate-status-banner");
  const msg = $("estimate-status-message");
  if (!banner || !msg) return;
  banner.classList.remove("hidden", "status-error", "status-warn");
  banner.classList.add(kind === "error" ? "status-error" : "status-warn");
  msg.textContent = message;
}

function hideStatusBanner() {
  $("estimate-status-banner")?.classList.add("hidden");
}

function scheduleBootstrapWatchdog() {
  if (bootstrapWatchdog) bootstrapWatchdog.clear();
  bootstrapWatchdog = createLoadWatchdog(BOOTSTRAP_WATCHDOG_MS, () => {
    forceClearAllListLoading(true);
    setLoadStage("");
    showStatusBanner(FETCH_FAIL_HINT);
  });
}

async function resolveAuthSession() {
  const code = customerCodeFromPath();
  setLoadStage("Loading auth…");
  if (!getCustomerToken()) {
    setLoadStage("");
    return { ok: false, code, reason: "no_token" };
  }
  try {
    const session = await withTimeout(fetchCustomerSession(), INIT_LOAD_TIMEOUT_MS, "auth");
    if (!session) {
      setLoadStage("");
      return { ok: false, code, reason: "invalid_session" };
    }
    if (session.customerCode && session.customerCode.toUpperCase() !== code) {
      setLoadStage("");
      return { ok: false, code, reason: "customer_mismatch" };
    }
    setLoadStage("Auth OK");
    return { ok: true, code, session };
  } catch {
    setLoadStage("");
    return { ok: false, code, reason: "auth_timeout" };
  }
}

async function reloadEstimateData() {
  scheduleBootstrapWatchdog();
  hideStatusBanner();
  const auth = await resolveAuthSession();
  if (!auth.ok) {
    const msg =
      auth.reason === "no_token"
        ? "ログインが必要です。ログインするか、手動で新規作成できます。"
        : "セッションを確認できませんでした。再読み込みまたはログインしてください。";
    showStatusBanner(msg);
    forceClearAllListLoading(true);
    return;
  }
  authSession = auth.session;
  await bootstrapEstimateData();
}

async function bootstrapEstimateData() {
  if (bootstrapInFlight) return;
  bootstrapInFlight = true;
  const code = customerCodeFromPath();
  setLoadStage("Loading…");
  const stages = [
    ["price-rules", () => loadPriceRulePresets()],
    ["pending", () => loadPending()],
    ["projects", () => loadProjects()],
    ["invoices", () => loadInvoices()],
    ["templates", () => loadLineTemplates()],
  ];
  let failedCount = 0;
  try {
    // 並列取得 — 直列だとタイムアウト合算で UI が長時間「読み込み中」のままになる
    const results = await Promise.all(
      stages.map(([label, fn]) =>
        Promise.resolve()
          .then(() => withTimeout(fn(), INIT_LOAD_TIMEOUT_MS, label))
          .then(() => ({ status: "fulfilled", label }))
          .catch((reason) => {
            console.error(`[estimate-v1] bootstrap stage failed: ${label}`, reason);
            return { status: "rejected", label, reason };
          })
      )
    );
    const failed = results.filter((r) => r.status === "rejected");
    failedCount = failed.length;
    if (failed.length) {
      console.warn("[estimate-v1] partial bootstrap failure", failed);
      const hasCache =
        cacheGet("estimate", `pending:${code}`) ||
        cacheGet("estimate", `projects:${code}`) ||
        cacheGet("estimate", `invoices:${code}`);
      showStatusBanner(
        hasCache
          ? "一部のデータを読み込めませんでした。前回保存分を表示しています。"
          : FETCH_FAIL_HINT
      );
    } else {
      hideStatusBanner();
    }
  } catch (e) {
    failedCount = stages.length;
    console.error("[estimate-v1] bootstrap crashed", e);
    showStatusBanner(FETCH_FAIL_HINT, "error");
  } finally {
    // 成功・失敗・例外いずれでもローダーを必ず解除（空リスト or エラー表示）
    try {
      forceClearAllListLoading(failedCount > 0);
    } catch (clearErr) {
      console.error("[estimate-v1] forceClearAllListLoading failed", clearErr);
    }
    setLoadStage("");
    bootstrapWatchdog?.clear();
    bootstrapInFlight = false;
    try {
      window.__estimateBootOk = true;
    } catch {
      /* ignore */
    }
  }
}

function toast(msg, opts = {}) {
  const el = $("toast");
  if (!el) return;
  const kind = String(opts.kind || "").trim();
  const durationMs = Number(opts.durationMs) > 0 ? Number(opts.durationMs) : 2200;
  el.textContent = msg;
  el.classList.remove("toast-success", "toast-error", "show");
  if (kind === "success") el.classList.add("toast-success");
  if (kind === "error") el.classList.add("toast-error");
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    el.classList.remove("show", "toast-success", "toast-error");
  }, durationMs);
}

function toastError(err, status) {
  const f = friendlyHttpError(err?.message || err, status);
  if (status === 401 || /unauthorized/i.test(String(err?.message || ""))) {
    toast("ログインが切れました。もう一度ログインしてください");
    return;
  }
  toast(`${f.title} — ${f.action}`);
}

function yen(n) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function newEmptyLine() {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: "other",
    name: "",
    memo: "",
    unit: "式",
    quantity: 1,
    unitPrice: 0,
    amount: 0,
    orderTarget: false,
  };
}

/**
 * 写真解析結果を既存明細の末尾へ追記。
 * 空の仮行だけなら置き換え、それ以外は append。
 * 品名タグ・固定メモは付けない。
 */
function appendParsedEstimateItems(items) {
  const incoming = (items || []).map((it) => ({
    ...newEmptyLine(),
    ...it,
    id: it.id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.unitPrice) || 0,
    amount: Math.round((Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)),
    name: String(it.name || "")
      .replace(/\[LINE画像解析\]/gi, "")
      .replace(/\[写真見積解析\]/gi, "")
      .trim(),
    unit: String(it.unit || "式"),
    memo: String(it.memo || "")
      .replace(/\[LINE画像解析\]/gi, "")
      .replace(/\[写真見積解析\]/gi, "")
      .trim(),
    fromAiCandidate: true,
  })).filter((it) => it.name);

  if (!incoming.length) return 0;

  const onlyEmptyPlaceholder =
    currentLines.length === 1 &&
    !String(currentLines[0]?.name || "").trim() &&
    Number(currentLines[0]?.unitPrice || 0) === 0;

  if (onlyEmptyPlaceholder) {
    currentLines = incoming;
  } else {
    currentLines = [...currentLines, ...incoming];
  }
  renderLines(currentLines);
  return incoming.length;
}

function setLineImageParseStatus(msg) {
  const el = $("line-image-parse-status");
  if (el) el.textContent = msg || "";
}

function toggleLineImageParseActions(show) {
  const el = $("line-image-parse-actions");
  if (!el) return;
  if (show) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

/**
 * 画像を API へ送り、明細を末尾追記する。
 * サーバー側 Gemini Vision OCR で実画像を解析する。
 */
async function parseLineImageAndAppend(file) {
  if (!file) return;
  const btn = $("btn-line-image-parse");
  if (btn) btn.disabled = true;
  setLineImageParseStatus("写真から見積もりを作成中…");
  toggleLineImageParseActions(false);
  try {
    let imageBase64 = "";
    try {
      imageBase64 = await fileToUploadBase64(file);
    } catch {
      imageBase64 = "";
    }
    if (!imageBase64) {
      setLineImageParseStatus("画像の読み込みに失敗しました");
      toast("画像の読み込みに失敗しました");
      return;
    }
    const data = await api("/parse-line-image", {
      method: "POST",
      body: JSON.stringify({
        imageBase64,
        fileName: file.name || "estimate-photo.jpg",
      }),
      label: "写真で見積もり作成",
      timeoutMs: 60_000,
    });
    const count = appendParsedEstimateItems(data.estimateItems || data.items || []);
    if (!count) {
      const warn0 = String((data.warnings && data.warnings[0]) || "").trim();
      // 生ログ・英語 JSON は出さず、日本語案内のみ
      const looksRaw =
        !warn0 ||
        /[{}\[]|models\/|Gemini Vision エラー|\b(404|not found|Exception|FAILED_PRECONDITION)\b/i.test(
          warn0
        );
      const friendly = looksRaw
        ? "解析エラーが発生しました。時間をおいて再試行してください。"
        : warn0;
      setLineImageParseStatus(friendly);
      toast(friendly);
      return;
    }
    setLineImageParseStatus(`${count}件を明細に追加しました`);
    toast(`${count}件を明細に追加しました`);
  } catch (e) {
    const friendly =
      "解析エラーが発生しました。時間をおいて再試行してください。";
    console.error("[estimate-v1] parse-line-image failed", e);
    setLineImageParseStatus(friendly);
    toast(friendly);
  } finally {
    if (btn) btn.disabled = false;
    const cam = $("line-image-input-camera");
    const lib = $("line-image-input-library");
    if (cam) cam.value = "";
    if (lib) lib.value = "";
  }
}

function bindLineImageParseUi() {
  // メインCTA → カメラ / ギャラリー選択を表示
  $("btn-line-image-parse")?.addEventListener("click", () => {
    const actions = $("line-image-parse-actions");
    const open = actions && !actions.hasAttribute("hidden");
    toggleLineImageParseActions(!open);
    if (!open) {
      setLineImageParseStatus(
        "カメラまたはギャラリーを選んでください"
      );
    }
  });
  $("btn-line-image-camera")?.addEventListener("click", () => {
    $("line-image-input-camera")?.click();
  });
  $("btn-line-image-library")?.addEventListener("click", () => {
    $("line-image-input-library")?.click();
  });
  $("line-image-input-camera")?.addEventListener("change", (ev) => {
    const file = ev.target?.files?.[0];
    if (file) parseLineImageAndAppend(file).catch(() => {});
  });
  $("line-image-input-library")?.addEventListener("change", (ev) => {
    const file = ev.target?.files?.[0];
    if (file) parseLineImageAndAppend(file).catch(() => {});
  });
}

/**
 * TOMS 履歴を localStorage にミラー保存。
 * オフライン時の一覧表示用（追記のみ）。
 */
function readLocalTomsHistory() {
  try {
    const raw = localStorage.getItem(TOMS_HISTORY_LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalTomsHistory(records) {
  try {
    localStorage.setItem(
      TOMS_HISTORY_LOCAL_KEY,
      JSON.stringify((records || []).slice(0, 100))
    );
  } catch {
    /* quota 等は無視 */
  }
}

function upsertLocalTomsHistory(record) {
  if (!record?.id) return;
  const list = readLocalTomsHistory().filter((r) => r.id !== record.id);
  list.unshift(record);
  writeLocalTomsHistory(list);
}

function buildLocalShareText(payload) {
  const items = (payload.items || []).filter((it) => String(it.name || "").trim());
  const lineSub = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const subtotal = payload.subtotal != null ? Number(payload.subtotal) : lineSub;
  const tax = payload.tax != null ? Number(payload.tax) : Math.round(subtotal * 0.1);
  const total = payload.total != null ? Number(payload.total) : subtotal + tax;
  const customer = String(payload.customerName || "").trim() || "お客様";
  const subject = String(payload.subject || "").trim() || "お見積り";
  return [
    "【TOMS お見積り】",
    `宛名: ${customer}`,
    `件名: ${subject}`,
    "",
    "■明細",
    ...items.map(
      (it, i) =>
        `${i + 1}. ${it.name} ${it.quantity}${it.unit || "式"} × ¥${Number(it.unitPrice || 0).toLocaleString("ja-JP")} = ¥${Number(it.amount || 0).toLocaleString("ja-JP")}`
    ),
    "",
    `小計: ¥${subtotal.toLocaleString("ja-JP")}`,
    `消費税: ¥${tax.toLocaleString("ja-JP")}`,
    `税込合計: ¥${total.toLocaleString("ja-JP")}`,
    "",
    TOMS_COMPANY_NAME,
  ].join("\n");
}

function collectCurrentEstimateSnapshot() {
  recalcLocal();
  const header = readHeaderForm();
  const items = currentLines
    .filter((it) => String(it.name || "").trim())
    .map((it) => ({
      name: it.name,
      unit: it.unit || "式",
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      amount: Number(it.amount) || 0,
      category: it.category || "other",
      memo: it.memo || "",
    }));
  const lineSubtotal = items.reduce((s, it) => s + (it.amount || 0), 0);
  const discount = readShuseiDiscount();
  const subtotal = Math.max(0, lineSubtotal - discount);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  return {
    customerName: header.addressee || currentCustomerName || "",
    subject: header.subject || "",
    workLocation: header.workLocation || "",
    notes: $("estimate-notes")?.value?.trim() || "",
    items,
    subtotal,
    tax,
    total,
    sourceProjectId: currentProjectId,
  };
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

/**
 * ワンタップ: LINE共有用テキストをコピー
 */
async function blastCopyLineShareText() {
  const snap = collectCurrentEstimateSnapshot();
  if (!snap.items.length) {
    toast("明細がありません");
    return;
  }
  try {
    const data = await api("/toms-estimate-share-text", {
      method: "POST",
      body: JSON.stringify(snap),
      label: "LINE共有テキスト",
    });
    const text = data.text || buildLocalShareText(snap);
    await copyTextToClipboard(text);
    toast("LINE共有テキストをコピーしました");
  } catch {
    const text = buildLocalShareText(snap);
    try {
      await copyTextToClipboard(text);
      toast("LINE共有テキストをコピーしました（オフライン）");
    } catch {
      toast("コピーに失敗しました");
    }
  }
}

/**
 * ワンタップ: 見積履歴へ保存（DB + localStorage）
 */
async function blastSaveTomsHistory() {
  const snap = collectCurrentEstimateSnapshot();
  if (!snap.items.length) {
    toast("明細がありません");
    return;
  }
  try {
    const data = await api("/toms-estimate-history", {
      method: "POST",
      body: JSON.stringify(snap),
      label: "履歴保存",
    });
    if (data.record) upsertLocalTomsHistory(data.record);
    toast("履歴に保存しました");
  } catch (e) {
    const localRecord = {
      id: `LOCAL-${Date.now()}`,
      ...snap,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceProjectId: snap.sourceProjectId || null,
      createdBy: null,
    };
    upsertLocalTomsHistory(localRecord);
    toast("端末に履歴保存しました（オフライン）");
    console.warn("[estimate-v1] toms history API failed", e);
  }
}

/**
 * ワンタップ: 見積PDFを開く
 */
async function blastOpenEstimatePdf() {
  if (!currentProjectId) {
    toast("案件を開いてください");
    return;
  }
  try {
    await openDocumentViewer("estimate");
  } catch (e) {
    toastError(e, e.status);
  }
}

function formatHistoryDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso || "");
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso || "");
  }
}

function renderTomsHistoryList(records) {
  const el = $("toms-history-list");
  if (!el) return;
  if (!records.length) {
    el.className = "toms-history-panel empty-state";
    el.innerHTML =
      '<div class="empty-icon">💾</div><p>まだTOMS履歴がありません</p><p class="section-hint">詳細画面の「履歴にワンタップ保存」から追加できます</p>';
    return;
  }
  el.className = "toms-history-panel";
  el.innerHTML = records
    .map(
      (r) => `
    <div class="toms-history-card" data-hist-id="${escapeHtml(r.id)}">
      <p class="hist-title">${escapeHtml(r.customerName || "（無名）")}</p>
      <p class="hist-meta">${escapeHtml(r.subject || "件名なし")} · ${escapeHtml(formatHistoryDate(r.createdAt))}</p>
      <p class="hist-total">${yen(r.total)}</p>
      <div class="toms-history-actions">
        <button type="button" class="btn-main blue" data-hist-action="reuse">再利用</button>
        <button type="button" class="btn-sub blue" data-hist-action="duplicate">複製保存</button>
      </div>
    </div>`
    )
    .join("");
  el.querySelectorAll(".toms-history-card").forEach((card) => {
    const id = card.getAttribute("data-hist-id");
    card.querySelector('[data-hist-action="reuse"]')?.addEventListener("click", () => {
      reuseTomsHistoryRecord(id).catch(() => {});
    });
    card.querySelector('[data-hist-action="duplicate"]')?.addEventListener("click", () => {
      duplicateTomsHistoryRecord(id).catch(() => {});
    });
  });
}

async function loadTomsHistoryList() {
  const el = $("toms-history-list");
  if (!el) return;
  el.className = "toms-history-panel empty-state";
  el.textContent = "読み込み中…";
  const local = readLocalTomsHistory();
  try {
    const data = await api("/toms-estimate-history?limit=50", {
      label: "TOMS履歴",
    });
    const records = data.records || [];
    // サーバー優先、ローカルのみの件を末尾マージ
    const serverIds = new Set(records.map((r) => r.id));
    const merged = [
      ...records,
      ...local.filter((r) => r.id && !serverIds.has(r.id)),
    ];
    writeLocalTomsHistory(merged);
    renderTomsHistoryList(merged);
  } catch {
    renderTomsHistoryList(local);
  }
}

/**
 * 履歴明細を現在の見積へ流し込み（新規スタンドアロン作成）。
 * 既存案件明細は上書きせず、新規作成→追記。
 */
async function reuseTomsHistoryRecord(id) {
  let record =
    readLocalTomsHistory().find((r) => r.id === id) || null;
  try {
    const data = await api(`/toms-estimate-history/${encodeURIComponent(id)}`, {
      label: "履歴取得",
    });
    if (data.record) record = data.record;
  } catch {
    /* local fallback */
  }
  if (!record?.items?.length) {
    toast("履歴が見つかりません");
    return;
  }
  try {
    toast("履歴から新規見積を作成中…");
    const detail = await api("/standalone-estimate", {
      method: "POST",
      body: JSON.stringify({
        addressee: record.customerName || "（履歴再利用）",
        subject: record.subject || "履歴から作成",
        staffName: "",
        workLocation: record.workLocation || "",
        notes: record.notes || "",
        items: record.items,
      }),
      label: "履歴再利用",
    });
    await loadProjects();
    await openDetail(detail.businessProjectId);
    // サーバーが items を反映済みならその明細、
    // なければ履歴明細を末尾追記
    if (detail.estimate?.items?.length) {
      currentLines = detail.estimate.items;
      renderLines(currentLines);
      recalcLocal();
    } else {
      appendParsedEstimateItems(record.items);
      recalcLocal();
    }
    toast("履歴から見積を作成しました");
  } catch (e) {
    // API失敗時: ローカル草稿へ流し込み
    resetStandaloneForm("estimate");
    if ($("standalone-addressee")) $("standalone-addressee").value = record.customerName || "";
    if ($("standalone-subject")) $("standalone-subject").value = record.subject || "";
    if ($("standalone-work-location")) {
      $("standalone-work-location").value = record.workLocation || "";
    }
    if ($("standalone-notes")) $("standalone-notes").value = record.notes || "";
    toast("オフラインのためフォームに反映しました。保存してください");
    console.warn("[estimate-v1] reuse history failed", e);
  }
}

async function duplicateTomsHistoryRecord(id) {
  try {
    const data = await api(
      `/toms-estimate-history/${encodeURIComponent(id)}/duplicate`,
      { method: "POST", label: "履歴複製" }
    );
    if (data.record) upsertLocalTomsHistory(data.record);
    toast("履歴を複製しました");
    await loadTomsHistoryList();
  } catch (e) {
    const src = readLocalTomsHistory().find((r) => r.id === id);
    if (!src) {
      toastError(e, e.status);
      return;
    }
    const dup = {
      ...src,
      id: `LOCAL-${Date.now()}`,
      subject: src.subject ? `${src.subject}（複製）` : "（複製）",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertLocalTomsHistory(dup);
    toast("端末内で履歴を複製しました");
    renderTomsHistoryList(readLocalTomsHistory());
  }
}

function bindTomsBlastActionsUi() {
  $("btn-toms-blast-pdf")?.addEventListener("click", () => {
    blastOpenEstimatePdf().catch(() => {});
  });
  $("btn-toms-blast-line")?.addEventListener("click", () => {
    blastCopyLineShareText().catch(() => {});
  });
  $("btn-toms-blast-save")?.addEventListener("click", () => {
    blastSaveTomsHistory().catch(() => {});
  });
}

/**
 * 🎙️ 音声入力 — 明細末尾追記 / 備考・メモへ流し込み
 * 既存明細は上書きしない
 */
function appendSpeechLinesToEstimate(text) {
  const parsed = parseEstimateSpeechLinesV1(text);
  if (!parsed.length) return 0;
  const incoming = parsed.map((p) => ({
    ...newEmptyLine(),
    name: p.unit ? `${p.name}${p.name ? " " : ""}${p.unit}`.trim() || p.raw : p.name || p.raw,
    quantity: p.qty || 1,
    unit: p.unit === "m" ? "m" : p.unit || "式",
    memo: "[音声入力]",
  }));
  // 末尾が空行なら置換、そうでなければ追記
  const last = currentLines[currentLines.length - 1];
  const lastEmpty =
    last &&
    !String(last.name || "").trim() &&
    !String(last.memo || "").trim() &&
    Number(last.unitPrice || 0) === 0;
  if (lastEmpty && currentLines.length) {
    currentLines = [...currentLines.slice(0, -1), ...incoming];
  } else {
    currentLines = [...currentLines, ...incoming];
  }
  renderLines(currentLines);
  recalcLocal();
  return incoming.length;
}

function bindEstimateVoiceInputUi() {
  const lineMount = $("estimate-voice-line-mount");
  if (lineMount && !lineMount.querySelector(".tisly-voice-wrap")) {
    mountVoiceInputButtonV1(lineMount, {
      label: "🎙️ 音声で明細追加",
      mode: "append",
      target: $("estimate-voice-scratch"),
      toast,
      onTranscript: (text) => {
        const n = appendSpeechLinesToEstimate(text);
        if (n > 0) toast(`${n} 件を明細に追記しました`);
      },
    });
  }

  const noteSpecs = [
    { mount: "estimate-voice-notes-mount", target: "estimate-notes" },
    { mount: "estimate-voice-hdr-notes-mount", target: "hdr-notes" },
    { mount: "estimate-voice-standalone-notes-mount", target: "standalone-notes" },
  ];
  for (const spec of noteSpecs) {
    const mount = $(spec.mount);
    const target = $(spec.target);
    if (!mount || !target || mount.querySelector(".tisly-voice-wrap")) continue;
    mountVoiceInputButtonV1(mount, {
      target,
      mode: "append",
      label: "🎙️ 音声入力",
      toast,
    });
  }
}

function isLocalProjectId(id) {
  return String(id || "").startsWith("LOCAL-");
}

function readLocalDraftStore() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DRAFTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalDraftStore(store) {
  localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(store));
}

function upsertLocalDraft(draft) {
  const store = readLocalDraftStore();
  store[draft.businessProjectId] = draft;
  writeLocalDraftStore(store);
}

function getLocalDraft(id) {
  return readLocalDraftStore()[id] || null;
}

function removeLocalDraft(id) {
  const store = readLocalDraftStore();
  if (!store[id]) return false;
  delete store[id];
  writeLocalDraftStore(store);
  return true;
}

function listLocalDrafts(customerCode) {
  const code = String(customerCode || "").toUpperCase();
  return Object.values(readLocalDraftStore()).filter(
    (d) => String(d.customerCode || "").toUpperCase() === code
  );
}

function resolveTomsBankInfoClient(bankInfo) {
  const trimmed = (bankInfo ?? "").trim();
  const base = !trimmed || /^\?{3,}$/.test(trimmed) ? TOMS_DEFAULT_BANK_INFO : trimmed;
  return base.replace(/トムス/g, "トムズ");
}

function createLocalDraftFromStandalone(mode, body) {
  const id = `LOCAL-${Date.now()}`;
  const now = new Date().toISOString();
  const items = body.items?.length ? body.items : [newEmptyLine()];
  const draft = {
    businessProjectId: id,
    mode,
    customerCode: customerCodeFromPath(),
    createdAt: now,
    updatedAt: now,
    localOnly: true,
    customerName: body.addressee,
    projectNo: id,
    header: {
      addressee: body.addressee,
      subject: body.subject,
      staffName: body.staffName || "",
      workLocation: body.workLocation || "",
      notes: body.notes || "",
      issueDate: todayIsoDate().replace(/-/g, "/"),
      estimateNo: "",
    },
    estimate: {
      items,
      shuseiDiscount: 0,
      shuseiDiscountMemo: "",
      subtotal: 0,
      tax: 0,
      total: 0,
    },
    estimateNotes: body.notes || "",
    invoice: null,
  };
  if (mode === "invoice") {
    draft.invoice = {
      customerName: body.addressee,
      createdAt: body.invoiceDate || todayIsoDate(),
      paymentDueDate: body.paymentDueDate || "",
      bankInfo: TOMS_DEFAULT_BANK_INFO,
    };
  }
  upsertLocalDraft(draft);
  return draft;
}

function localDraftAsProject(draft) {
  const subject = draft.header?.subject || "";
  const workLocation = draft.header?.workLocation || "";
  return {
    businessProjectId: draft.businessProjectId,
    customerName: draft.customerName || draft.header?.addressee,
    projectNo: draft.projectNo || draft.businessProjectId,
    title: subject || draft.customerName || "",
    subject,
    workLocation,
    header: draft.header,
    estimate: draft.estimate,
    estimateNotes: draft.estimateNotes,
    invoice: draft.invoice,
    total: draft.estimate?.total ?? null,
    invoiceTotal: draft.estimate?.total ?? null,
    localOnly: true,
  };
}

function saveLocalDraftFromCurrentState() {
  if (!currentProjectId || !isLocalProjectId(currentProjectId)) return null;
  const draft = getLocalDraft(currentProjectId) || {
    businessProjectId: currentProjectId,
    mode: hasInvoice ? "invoice" : "estimate",
    customerCode: customerCodeFromPath(),
    createdAt: new Date().toISOString(),
    invoice: hasInvoice
      ? {
          customerName: $("hdr-addressee")?.value?.trim() || "",
          createdAt: $("hdr-invoice-date")?.value || todayIsoDate(),
          paymentDueDate: $("hdr-payment-due")?.value || "",
          bankInfo: TOMS_DEFAULT_BANK_INFO,
        }
      : null,
  };
  recalcLocal();
  draft.header = { ...(draft.header || {}), ...readHeaderForm() };
  draft.estimateNotes = $("estimate-notes")?.value?.trim() ?? "";
  draft.estimate = {
    ...(draft.estimate || {}),
    items: currentLines,
    shuseiDiscount: readShuseiDiscount(),
    shuseiDiscountMemo: $("shusei-discount-memo")?.value?.trim() ?? "",
  };
  if (hasInvoice) {
    draft.invoice = {
      ...(draft.invoice || {}),
      customerName: draft.header?.addressee || draft.customerName,
      createdAt: $("hdr-invoice-date")?.value || draft.invoice?.createdAt || todayIsoDate(),
      paymentDueDate: $("hdr-payment-due")?.value || "",
      bankInfo: resolveTomsBankInfoClient(draft.invoice?.bankInfo),
    };
    draft.mode = "invoice";
  }
  draft.updatedAt = new Date().toISOString();
  upsertLocalDraft(draft);
  return draft;
}

function savePendingOverlay(projectId, payload) {
  localStorage.setItem(
    PENDING_SAVE_PREFIX + projectId,
    JSON.stringify({ ...payload, savedAt: new Date().toISOString() })
  );
}

function showPdfQuickError(message) {
  const el = $("pdf-quick-error");
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.classList.remove("visible");
    return;
  }
  el.textContent = message;
  el.classList.add("visible");
}

function renderInvoiceBankPanel(invoice) {
  const panel = $("invoice-bank-panel");
  if (!panel) return;
  panel.classList.toggle("hidden", !invoice);
  if (!invoice) return;
  const companyEl = $("invoice-company-label");
  if (companyEl) companyEl.textContent = TOMS_COMPANY_NAME;
  const bankEl = $("invoice-bank-display");
  if (bankEl) bankEl.textContent = resolveTomsBankInfoClient(invoice.bankInfo);
}

const LINE_FIELD_ORDER = ["desc", "qty", "price"];

function focusLineField(rowIdx, fieldName) {
  const row = $("line-list")?.querySelector(`.line-item-card[data-idx="${rowIdx}"]`);
  if (!row) return false;
  const el = row.querySelector(`[data-field="${fieldName}"]`);
  if (!el) return false;
  el.focus();
  if (el.select) el.select();
  return true;
}

function splitDescription(name, memo) {
  const n = String(name || "").trim();
  const m = String(memo || "").trim();
  if (n && m) return `${n}\n${m}`;
  return n || m;
}

function parseDescription(text) {
  const lines = String(text || "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return { name: "", memo: "" };
  if (lines.length === 1) return { name: lines[0], memo: "" };
  return { name: lines[0], memo: lines.slice(1).join("\n") };
}

async function storageApi(path, opts = {}) {
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
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const label = opts.label || "見積API";
  return fetchJson(
    `${API}${path}`,
    {
      ...opts,
      label,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    },
    opts.timeoutMs ?? INIT_LOAD_TIMEOUT_MS
  );
}

async function projectsApi(path, opts = {}) {
  const token = getCustomerToken();
  const label = opts.label || "案件API";
  return fetchJson(
    `${PROJECTS_API}${path}`,
    {
      ...opts,
      label,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    },
    opts.timeoutMs ?? INIT_LOAD_TIMEOUT_MS
  );
}

function projectListTitle(p) {
  return resolveProjectDisplayName({
    customerName: p.customerName,
    clientName: p.clientName,
    companyName: p.companyName,
    projectName: p.projectName,
    siteName: p.siteName,
    title: p.title,
  });
}

function projectSubject(p) {
  return (p?.subject || p?.header?.subject || p?.title || "").trim();
}

/** 削除確認用：『〇〇様 - 件名』 */
function deleteConfirmLabel(p) {
  if (!p) return "（不明）様 - （件名なし）";
  const name = (projectListTitle(p) || "（名前なし）").trim();
  const subject = projectSubject(p) || "（件名なし）";
  const withSama = /様$/.test(name) ? name : `${name}様`;
  return `${withSama} - ${subject}`;
}

function rememberListProjects(projects) {
  for (const p of projects || []) {
    if (p?.businessProjectId) listProjectById.set(p.businessProjectId, p);
  }
}

function listCardDeleteBtnHtml() {
  return `<div class="list-card-actions"><button type="button" class="list-card-action" data-action="delete" title="削除" aria-label="削除">🗑</button></div>`;
}

/** Lucide HardDrive 風アイコン（インライン SVG） */
function qnapSaveIconSvg() {
  return `<svg class="qnap-save-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>`;
}

/** 請求書作成済み（または請求一覧）か */
function projectHasInvoiceCreated(p) {
  if (!p) return false;
  if (p.localOnly) return false;
  if (p.invoiceId || p.invoiceNo) return true;
  if (p.standaloneDocKind === "invoice") return true;
  return false;
}

/** 見積書の準備ができました（PDF / estimate / 確定済みバッジ相当） */
function projectHasEstimateReady(p) {
  if (!p) return false;
  if (p.localOnly) return false;
  if (p.pdfPath || p.estimateId || p.estimateNo) return true;
  if (p.standaloneDocKind === "estimate") return true;
  if (p.tomsFormatReady || p.hasEstimate) return true;
  return false;
}

/** QNAP保存ボタン表示対象 — 見積準備済み or 請求作成済み（請求のみ制限しない） */
function projectHasQnapSaveEligible(p) {
  if (!p || p.localOnly) return false;
  return projectHasEstimateReady(p) || projectHasInvoiceCreated(p);
}

/**
 * 一覧アクション — ゴミ箱の左隣に紺色 QNAP保存
 * 「見積書の準備ができました」「請求書作成済み」の両方で表示
 */
function listCardActionsHtml(p, opts = {}) {
  const forceQnap = opts.forceQnap === true;
  const showQnap =
    !p?.localOnly && (forceQnap || projectHasQnapSaveEligible(p));
  const actions = showQnap
    ? `<button type="button" class="list-card-action" data-action="qnap-save" title="QNAPへ保存" aria-label="QNAPへ保存">${qnapSaveIconSvg()}</button><button type="button" class="list-card-action" data-action="delete" title="削除" aria-label="削除">🗑</button>`
    : `<button type="button" class="list-card-action" data-action="delete" title="削除" aria-label="削除">🗑</button>`;
  return `<div class="list-card-actions">${actions}</div>`;
}

/** 一覧カード用：件名・現場・金額（番号は出さない） */
function listCardDetailHtml(p, amount) {
  const subject = projectSubject(p);
  const workLocation = (p.workLocation || p.header?.workLocation || p.address || "").trim();
  const lines = [
    `<h2>${escapeHtml(projectListTitle(p))}</h2>`,
    subject ? `<p class="list-card-meta">件名：${escapeHtml(subject)}</p>` : "",
    workLocation ? `<p class="list-card-meta">現場：${escapeHtml(workLocation)}</p>` : "",
    `<p class="list-card-amount">金額：${amount != null ? yen(amount) : "—"}</p>`,
  ];
  return lines.filter(Boolean).join("\n        ");
}

function estimateListStatusBadge(p) {
  if (p.localOnly) return '<span class="status-badge orange">端末内</span>';
  if (p.pdfPath) return '<span class="status-badge done">見積書の準備ができました</span>';
  return '<span class="status-badge orange">下書き</span>';
}

function invoiceListStatusBadge(p) {
  if (p.localOnly) return '<span class="status-badge orange">端末内</span>';
  return '<span class="status-badge done">請求書の準備ができました</span>';
}

function showView(name) {
  currentView = name;
  $("view-list").classList.toggle("hidden", name !== "list");
  $("view-detail").classList.toggle("hidden", name !== "detail");
  practicalNav?.setTitle(name === "detail" ? "見積の内容" : "見積");
  practicalNav?.setBackVisible(true);
  if (name === "detail" && selectionMode) setSelectionMode(false, { reload: false });
  $("page-hint").textContent =
    name === "detail"
      ? "部材の数量・単価を直して、見積もりを確定できます"
      : selectionMode
        ? "削除する見積・請求書にチェックを入れてください"
        : "お仕事の料金をまとめます";
  syncBulkBar();
}

function handlePracticalBack() {
  if (!$("delete-dialog-overlay")?.classList.contains("hidden")) {
    hideDeleteConfirmDialog();
    return;
  }
  if (selectionMode) {
    setSelectionMode(false);
    return;
  }
  if (!$("standalone-form-panel")?.classList.contains("hidden")) {
    hideStandaloneForm();
    return;
  }
  if (currentView === "detail") {
    showView("list");
    loadPending();
    loadProjects();
    loadInvoices();
    return;
  }
  if (navigatePracticalReturn(() => {})) return;
  navigateBackOne(getDefaultNavFallbackV1(location.pathname));
}

function renderPendingList(surveys) {
  const el = $("pending-list");
  if (!surveys.length) {
    el.className = "empty-state";
    el.innerHTML =
      '<div class="empty-icon">💰</div><p>見積待ちの案件はありません</p><p>現調で「見積へ送る」を押すと、ここに表示されます</p>';
    return;
  }
  el.className = "";
  el.innerHTML = surveys
    .map(
      (s) => `
    <div class="friendly-card list-card" data-survey-id="${s.surveyProjectId}" data-has-estimate="${s.hasEstimate ? "1" : "0"}" data-biz-id="${s.businessProjectId || ""}">
      <span class="status-badge orange">見積待ち</span>
      <h2>${escapeHtml(projectListTitle(s))}</h2>
      <p>${escapeHtml(s.projectNo || s.surveyProjectId)}</p>
      <p style="color:var(--tisly-blue);font-size:0.9rem;margin-top:0.35rem;">
        ${s.hasEstimate ? "タップして見積を開く" : "タップして見積を作る"}
      </p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-card").forEach((node) => {
    node.addEventListener("click", () => onPendingClick(node));
  });
}

function renderInvoiceList(projects) {
  const el = $("invoice-list");
  if (!el) return;
  if (!projects.length) {
    el.className = "empty-state";
    el.innerHTML = '<div class="empty-icon">🧾</div><p>まだ請求書がありません</p><p>【新規請求書】から単独作成できます</p>';
    return;
  }
  el.className = "";
  rememberListProjects(projects);
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="friendly-card list-card${selectionMode ? " select-mode-card" : p.localOnly ? " has-card-delete" : " has-card-actions"}${selectedIds.has(p.businessProjectId) ? " is-selected" : ""}" data-id="${escapeHtml(p.businessProjectId)}" data-local="${p.localOnly ? "1" : "0"}" data-has-invoice="${p.localOnly ? "0" : "1"}">
      ${selectionMode ? listSelectCheckboxHtml(p.businessProjectId) : listCardActionsHtml(p, { forceQnap: !p.localOnly })}
      <div class="list-card-main">
        ${invoiceListStatusBadge(p)}
        ${listCardDetailHtml(p, p.invoiceTotal != null ? p.invoiceTotal : p.total)}
      </div>
    </div>`
    )
    .join("");
  bindSelectableListCards(el);
}

async function loadInvoices() {
  const code = customerCodeFromPath();
  const el = $("invoice-list");
  const cacheKey = `invoices:${code}`;
  const localInvoices = listLocalDrafts(code)
    .filter((d) => d.mode === "invoice" || d.invoice)
    .map(localDraftAsProject);
  try {
    const data = await api(`/invoices?customerCode=${encodeURIComponent(code)}`, { label: "請求書" });
    cacheSet("estimate", cacheKey, data);
    renderInvoiceList([...localInvoices, ...(data.projects || [])]);
  } catch (e) {
    const cached = cacheGet("estimate", cacheKey);
    const merged = cached?.projects
      ? [...localInvoices, ...cached.projects]
      : localInvoices;
    if (el) {
      if (merged.length) {
        renderInvoiceList(merged);
      } else {
        el.innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
      }
    }
  } finally {
    clearListLoading(
      el,
      '<div class="empty-icon">🧾</div><p>請求書はまだありません</p><p class="section-hint">データがありません</p>'
    );
  }
}

function refreshListTabVisibility() {
  const pending = $("tab-pending")?.classList.contains("active");
  const invoices = $("tab-invoices")?.classList.contains("active");
  const history = $("tab-toms-history")?.classList.contains("active");
  $("pending-list")?.classList.toggle("hidden", !pending);
  $("project-list")?.classList.toggle("hidden", pending || invoices || history);
  $("invoice-list")?.classList.toggle("hidden", !invoices);
  $("toms-history-list")?.classList.toggle("hidden", !history);
  updateSelectToolbarVisibility();
  syncBulkBar();
}

function listSelectCheckboxHtml(id) {
  const checked = selectedIds.has(id) ? "checked" : "";
  return `<label class="list-select-check" aria-label="選択"><input type="checkbox" class="bulk-check" data-bulk-id="${escapeHtml(id)}" ${checked} tabindex="-1" /></label>`;
}

function bindSelectableListCards(container) {
  container.querySelectorAll(".list-card").forEach((node) => {
    node.addEventListener("click", (ev) => {
      if (ev.target.closest(".list-card-action")) return;
      const id = node.dataset.id;
      if (!id) return;
      if (selectionMode) {
        ev.preventDefault();
        toggleSelection(id, node);
        return;
      }
      openDetail(id);
    });
    node.querySelector('[data-action="delete"]')?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = node.dataset.id;
      if (!id || bulkDeleteInProgress) return;
      showDeleteConfirmDialog([id]);
    });
    node.querySelector('[data-action="qnap-save"]')?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = node.dataset.id;
      const btn = ev.currentTarget;
      if (!id || btn?.disabled || btn?.classList.contains("is-loading")) return;
      saveListProjectToQnap(id, btn);
    });
  });
}

/** 一覧カードから見積・請求 PDF を QNAP 保存（VPS プロキシのみ — ブラウザ直通信なし） */
function qnapSaveSuccessToastMessage(resultOrHost) {
  if (resultOrHost && typeof resultOrHost === "object" && resultOrHost.pendingSync) {
    return documentNasPdfSavePendingMessage();
  }
  const host =
    (typeof resultOrHost === "string" && resultOrHost) ||
    resultOrHost?.host ||
    (() => {
      try {
        if (resultOrHost?.webdavUrl) return new URL(resultOrHost.webdavUrl).hostname;
      } catch {
        /* */
      }
      return null;
    })() ||
    getStoredDocumentNasHost() ||
    DOCUMENT_NAS_HOST;
  const port =
    (typeof resultOrHost === "object" && resultOrHost && Number(resultOrHost.port) > 0
      ? Number(resultOrHost.port)
      : null) ||
    (() => {
      try {
        if (resultOrHost?.webdavUrl) {
          const p = Number(new URL(resultOrHost.webdavUrl).port);
          return Number.isFinite(p) && p > 0 ? p : null;
        }
      } catch {
        /* */
      }
      return null;
    })();
  const msg =
    (typeof resultOrHost === "object" &&
      resultOrHost &&
      String(resultOrHost.message || "").trim()) ||
    documentNasSaveSuccessMessage(host, port);
  try {
    if (port) setStoredDocumentNasPort(port);
    console.info(`[QNAP save toast] ${msg}`);
  } catch {
    /* */
  }
  return msg;
}

/** API 応答から現場向けトースト文言を抽出（成功・失敗共通） */
function qnapSaveFeedbackMessage(body, httpStatus) {
  if (body?.pendingSync || body?.fallbackRoute === "local_pending") {
    const base = documentNasPdfSavePendingMessage();
    const summary = String(body?.probeSummary || "").trim();
    return summary ? `${base}｜${summary}` : base;
  }
  const raw = String(body?.message || body?.error || "").trim();
  if (raw) return raw;
  const code = String(body?.errorCode || "").trim();
  const summary = String(body?.probeSummary || "").trim();
  if (code === "PENDING_SYNC") {
    const base = documentNasPdfSavePendingMessage();
    return summary ? `${base}｜${summary}` : base;
  }
  if (code === "ETIMEDOUT" || /timeout/i.test(code)) {
    const base =
      "VPSから nastoms への接続がタイムアウトしました。Tailscale / LAN接続状態を確認してください";
    return summary ? `${base}｜${summary}` : base;
  }
  if (code === "ECONNREFUSED" || code === "ALL_PORTS_REFUSED") {
    const h = String(body?.host || "").trim() || "100.99.31.120";
    const base = `QNAP (${h}) の WebDAV サービスが有効になっているか、QNAPコントロールパネルをご確認ください`;
    return summary ? `${base}｜${summary}` : base;
  }
  if (
    code === "401 Unauthorized" ||
    code === "403 Forbidden" ||
    Number(httpStatus) === 401 ||
    Number(httpStatus) === 403
  ) {
    return "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください";
  }
  const fail = `QNAP保存に失敗しました（HTTP ${httpStatus || "?"}）`;
  return summary ? `${fail}｜${summary}` : fail;
}

async function saveListProjectToQnap(projectId, btn) {
  if (!projectId) return;
  const originalHtml = btn?.innerHTML;
  try {
    if (btn) {
      btn.classList.add("is-loading");
      btn.disabled = true;
      btn.innerHTML = '<span class="qnap-save-spinner" aria-hidden="true"></span>';
    }

    const token = getCustomerToken();
    let res;
    try {
      res = await fetch(
        `/api/estimate/v1/projects/${encodeURIComponent(projectId)}/qnap-save-invoices-estimates`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: "{}",
          // サーバは即時 200 を返すため短め（旧 90s 待ちによる UX 劣化を解消）
          signal: AbortSignal.timeout(15_000),
        }
      );
    } catch (e) {
      const detail = e?.name === "TimeoutError" || e?.name === "AbortError"
        ? "VPSへの接続がタイムアウトしました。通信環境を確認して再試行してください"
        : e?.message || "VPSへの接続に失敗しました";
      toast(detail);
      return;
    }

    const body = await res.json().catch(() => ({
      ok: false,
      message: `HTTP ${res.status}`,
      error: `HTTP ${res.status}`,
    }));

    if (res.ok && (body?.ok || body?.success)) {
      // 非同期受付応答 → 即時フィードバック + 完了ポーリング（絶対パス表示）
      if (body?.asyncStarted || body?.queued) {
        toast(documentNasPdfSaveRequestSentMessage());
        if (body?.jobId) {
          void pollQnapSaveJobAndToast(body.jobId, token);
        }
        return;
      }
      showQnapSaveDoneToast(body);
      return;
    }

    toast(qnapSaveFeedbackMessage(body, res.status), {
      kind: "error",
      durationMs: 5200,
    });
  } catch (e) {
    toast(e?.message || "QNAP保存を完了できませんでした（後で再試行できます）", {
      kind: "error",
      durationMs: 4200,
    });
  } finally {
    if (btn) {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      if (originalHtml != null) btn.innerHTML = originalHtml;
    }
  }
}

/** 非同期ジョブ完了後に絶対パス付きトーストを出す（1秒間隔・最大10秒） */
async function pollQnapSaveJobAndToast(jobId, token) {
  const maxAttempts = 10;
  const delayMs = 1000;
  for (let i = 0; i < maxAttempts; i += 1) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(
        `/api/estimate/v1/projects/qnap-jobs/${encodeURIComponent(jobId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        }
      );
      if (!res.ok) continue;
      const body = await res.json().catch(() => null);
      if (!body?.done) continue;
      showQnapSaveDoneToast(body);
      return;
    } catch {
      /* ポーリング継続 */
    }
  }
  toast("QNAP保存の完了確認がタイムアウトしました。ストレージ設定のデバッグログを確認してください", {
    kind: "error",
    durationMs: 4200,
  });
}

function formatQnapSaveDoneToast(body) {
  const paths = Array.isArray(body?.savedAbsolutePaths)
    ? body.savedAbsolutePaths.filter(Boolean)
    : Array.isArray(body?.result?.savedAbsolutePaths)
      ? body.result.savedAbsolutePaths.filter(Boolean)
      : [];
  if (body?.pendingSync || body?.status === "pending_sync") {
    const base = documentNasPdfSavePendingMessage();
    const summary = String(
      body?.probeSummary || body?.result?.probeSummary || body?.message || ""
    ).trim();
    if (summary.includes("不通") || summary.includes("=")) {
      return summary.startsWith("一時保存") ? summary : `${base}｜${summary}`;
    }
    return base;
  }
  if (body?.status === "failed" || body?.ok === false) {
    return qnapSaveFeedbackMessage(
      {
        ...(body?.result || {}),
        ...body,
        probeSummary:
          body?.probeSummary ||
          body?.result?.probeSummary ||
          body?.error ||
          null,
      },
      0
    );
  }
  const msg = String(body?.message || body?.result?.message || "").trim();
  if (msg.includes("への保存が完了しました") || msg.startsWith("QNAP保存成功")) {
    return msg;
  }
  if (paths.length > 0) {
    return documentNasPdfSaveSuccessMessage(paths);
  }
  return msg || documentNasPdfSaveSuccessMessage();
}

function showQnapSaveDoneToast(body) {
  const text = formatQnapSaveDoneToast(body);
  const failed = body?.status === "failed" || body?.ok === false;
  const pending = body?.pendingSync || body?.status === "pending_sync";
  if (failed) {
    toast(text, { kind: "error", durationMs: 5200 });
    return;
  }
  if (pending) {
    toast(text, { durationMs: 4200 });
    return;
  }
  toast(text, { kind: "success", durationMs: 4200 });
}

function toggleSelection(id, cardNode) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const checked = selectedIds.has(id);
  cardNode?.classList.toggle("is-selected", checked);
  const cb = cardNode?.querySelector(".bulk-check");
  if (cb) cb.checked = checked;
  syncBulkBar();
}

function currentListTab() {
  if ($("tab-invoices")?.classList.contains("active")) return "invoices";
  if ($("tab-projects")?.classList.contains("active")) return "projects";
  if ($("tab-toms-history")?.classList.contains("active")) return "toms-history";
  return "pending";
}

function updateSelectToolbarVisibility() {
  const toolbar = $("list-select-toolbar");
  if (!toolbar) return;
  const tab = currentListTab();
  const show = tab === "projects" || tab === "invoices";
  toolbar.classList.toggle("hidden", !show);
  if (!show && selectionMode) setSelectionMode(false);
}

function setSelectionMode(on, { reload = true } = {}) {
  selectionMode = Boolean(on);
  if (!selectionMode) selectedIds.clear();
  const btn = $("btn-select-mode");
  if (btn) {
    btn.classList.toggle("active", selectionMode);
    btn.setAttribute("aria-pressed", selectionMode ? "true" : "false");
    btn.textContent = selectionMode ? "選択解除" : "選択";
  }
  document.body.classList.toggle("has-estimate-bulk-bar", selectionMode && currentView === "list");
  if (currentView === "list") {
    $("page-hint").textContent = selectionMode
      ? "削除する見積・請求書にチェックを入れてください"
      : "お仕事の料金をまとめます";
  }
  syncBulkBar();
  if (!reload) return;
  // 再描画してチェックボックスの表示を切替
  if (currentListTab() === "projects" || currentListTab() === "invoices") {
    loadProjects();
    loadInvoices();
  }
}

function syncBulkBar() {
  const bar = $("estimate-bulk-bar");
  if (!bar) return;
  const show = selectionMode && currentView === "list" && currentListTab() !== "pending";
  bar.classList.toggle("hidden", !show);
  document.body.classList.toggle("has-estimate-bulk-bar", show);
  const count = selectedIds.size;
  const countEl = $("bulk-count");
  if (countEl) countEl.textContent = `${count}件選択`;
  const delBtn = $("btn-bulk-delete");
  if (delBtn) delBtn.disabled = count === 0 || bulkDeleteInProgress;
}

function hideDeleteConfirmDialog() {
  $("delete-dialog-overlay")?.classList.add("hidden");
  pendingDeleteIds = [];
}

function showDeleteConfirmDialog(ids) {
  const list = [...ids].filter(Boolean);
  if (!list.length) return;
  pendingDeleteIds = list;
  const title = $("delete-dialog-title");
  const body = $("delete-dialog-body");
  if (list.length === 1) {
    const label = deleteConfirmLabel(listProjectById.get(list[0]));
    if (title) title.textContent = "削除の確認";
    if (body) {
      body.innerHTML = `
      <p>『${escapeHtml(label)}』を削除してもよろしいですか？</p>
      <p style="margin-top:0.55rem;color:#64748b;font-size:0.88rem;">削除後は一覧から非表示になります（復元は案件一覧の削除済みから可能です）。</p>`;
    }
  } else {
    const labels = list.map((id) => deleteConfirmLabel(listProjectById.get(id)));
    if (title) title.textContent = "一括削除の確認";
    if (body) {
      const preview = labels
        .slice(0, 5)
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join("");
      const more = labels.length > 5 ? `<li>ほか ${labels.length - 5} 件</li>` : "";
      body.innerHTML = `
      <p><strong>${list.length}件</strong>の見積・請求書を削除します。</p>
      <ul style="margin:0.4rem 0 0.6rem;padding-left:1.2rem;line-height:1.45;">${preview}${more}</ul>
      <p>削除してもよろしいですか？</p>
      <p style="margin-top:0.45rem;color:#64748b;font-size:0.88rem;">復元は案件一覧の削除済みから可能です。</p>`;
    }
  }
  $("delete-dialog-overlay")?.classList.remove("hidden");
}

async function deleteSelectedProjects() {
  const ids = pendingDeleteIds.length ? [...pendingDeleteIds] : [...selectedIds];
  if (!ids.length || bulkDeleteInProgress) return;
  hideDeleteConfirmDialog();
  bulkDeleteInProgress = true;
  syncBulkBar();
  let ok = 0;
  let fail = 0;
  for (const id of ids) {
    try {
      if (isLocalProjectId(id)) {
        removeLocalDraft(id);
        listProjectById.delete(id);
        ok += 1;
        continue;
      }
      await projectsApi(`/projects/${encodeURIComponent(id)}?source=business`, {
        method: "DELETE",
        label: "削除",
      });
      listProjectById.delete(id);
      selectedIds.delete(id);
      ok += 1;
    } catch (e) {
      console.error("[estimate-v1] delete failed", id, e);
      fail += 1;
    }
  }
  bulkDeleteInProgress = false;
  if (selectionMode) {
    selectedIds.clear();
    setSelectionMode(false, { reload: false });
  }
  const code = customerCodeFromPath();
  cacheSet("estimate", `projects:${code}`, null);
  cacheSet("estimate", `invoices:${code}`, null);
  await Promise.all([loadProjects(), loadInvoices()]);
  if (fail === 0) toast(ok === 1 ? "削除しました" : `${ok}件を削除しました`);
  else toast(`${ok}件削除 · ${fail}件失敗`);
}

function renderProjectList(projects) {
  const el = $("project-list");
  if (!projects.length) {
    el.className = "empty-state";
    el.innerHTML = '<div class="empty-icon">📋</div><p>まだ見積がありません</p>';
    return;
  }
  el.className = "";
  rememberListProjects(projects);
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="friendly-card list-card${selectionMode ? " select-mode-card" : projectHasQnapSaveEligible(p) ? " has-card-actions" : " has-card-delete"}${selectedIds.has(p.businessProjectId) ? " is-selected" : ""}" data-id="${escapeHtml(p.businessProjectId)}" data-local="${p.localOnly ? "1" : "0"}" data-has-invoice="${projectHasInvoiceCreated(p) ? "1" : "0"}" data-qnap-eligible="${projectHasQnapSaveEligible(p) ? "1" : "0"}">
      ${selectionMode ? listSelectCheckboxHtml(p.businessProjectId) : listCardActionsHtml(p, { forceQnap: projectHasQnapSaveEligible(p) })}
      <div class="list-card-main">
        ${estimateListStatusBadge(p)}
        ${listCardDetailHtml(p, p.total)}
      </div>
    </div>`
    )
    .join("");
  bindSelectableListCards(el);
}

let pendingSurveyForEstimate = null;

function renderMaterialCandidates(groups) {
  if (!groups?.length) return "<p>候補部材はありません</p>";
  return groups
    .map(
      (g) => `<p><strong>${escapeHtml(g.label)}</strong><br>${(g.items || [])
        .map((it) => `<span class="material-chip">${escapeHtml(it)}</span>`)
        .join(" ")}</p>`
    )
    .join("");
}

function renderMasterDraftBadge(masterDraftId) {
  const badge = $("master-draft-badge");
  if (!badge) return;
  const show = Boolean(masterDraftId);
  badge.classList.toggle("hidden", !show);
  currentMasterDraftId = masterDraftId || null;
}

function masterPriceSourceLabel(src) {
  const map = {
    customer_override: "顧客別",
    rank_multiplier: "ランク",
    standard: "標準",
    cost_double: "原価2倍",
    missing: "未入力",
  };
  return map[src] || src || "—";
}

function lineMasterMetricsHtml(it) {
  if (!it?.priceSource && !it?.fromAiCandidate && !(it?.costPrice > 0)) return "";
  const qty = Number(it.quantity || 0);
  const sell = Number(it.unitPrice || 0);
  const cost = Number(it.costPrice || 0);
  const subtotal = qty * sell;
  const gross = subtotal - qty * cost;
  const rate = sell > 0 ? Math.round(((sell - cost) / sell) * 1000) / 10 : 0;
  const source = masterPriceSourceLabel(it.priceSource);
  return `<div class="line-master-metrics">
    原価 ${yen(cost)} · 売価 ${yen(sell)} · 数量 ${qty} · 小計 ${yen(subtotal)} · 粗利 ${yen(gross)}（${rate}%）
    <span class="line-price-source">価格根拠：${escapeHtml(source)}</span>
  </div>`;
}

function renderMasterPricingPanel(summary) {
  const panel = $("master-pricing-panel");
  if (!panel) return;
  const show = Boolean(currentMasterDraftId);
  panel.classList.toggle("hidden", !show);
  if (!show) return;

  currentMasterPricingSummary = summary || null;
  const badges = $("master-pricing-badges");
  const warning = $("master-pricing-warning");
  const summaryEl = $("master-pricing-summary");

  if (badges) {
    const parts = [];
    if (summary?.customerOverrideCount > 0) {
      parts.push(`<span class="master-pricing-badge">顧客別単価あり ${summary.customerOverrideCount}件</span>`);
    }
    if (summary?.rankCount > 0) {
      parts.push(`<span class="master-pricing-badge">ランク反映あり ${summary.rankCount}件</span>`);
    }
    if (summary?.standardCount > 0) {
      parts.push(`<span class="master-pricing-badge">標準売価 ${summary.standardCount}件</span>`);
    }
    if (summary?.costDoubleCount > 0) {
      parts.push(`<span class="master-pricing-badge">原価2倍 ${summary.costDoubleCount}件</span>`);
    }
    badges.innerHTML = parts.join("") || '<span class="section-hint" style="margin:0;">マスター候補から作成</span>';
  }

  if (warning) {
    const missing = summary?.missingCostCount > 0;
    warning.classList.toggle("hidden", !missing);
    if (missing) {
      const labels = (summary.missingCostLabels || []).slice(0, 5).join("、");
      const more = (summary.missingCostLabels || []).length > 5 ? " 他" : "";
      warning.textContent = `原価未入力あり（${summary.missingCostCount}件）${labels ? `：${labels}${more}` : ""}`;
    }
  }

  if (summaryEl && summary) {
    summaryEl.textContent = `合計 原価 ${yen(summary.totalCost)} / 売価 ${yen(summary.totalSell)} / 粗利 ${yen(summary.grossProfit)}（${summary.grossProfitRate}%）`;
  } else if (summaryEl) {
    summaryEl.textContent = "マスター候補の価格を反映しています";
  }
}

async function loadMasterPricingSummary(masterDraftId) {
  if (!masterDraftId) {
    renderMasterPricingPanel(null);
    return;
  }
  try {
    const data = await api(`/master-drafts/${encodeURIComponent(masterDraftId)}`);
    renderMasterPricingPanel(data.pricingSummary);
  } catch {
    renderMasterPricingPanel(null);
  }
}

async function recalcMasterPricing() {
  if (!currentProjectId || !currentMasterDraftId) {
    toast("マスター候補連携の見積のみ再計算できます");
    return;
  }
  try {
    toast("価格を再計算しています…");
    const detail = await api(`/projects/${currentProjectId}/recalculate-master-pricing`, {
      method: "POST",
      body: "{}",
    });
    renderMasterDraftBadge(detail.masterDraftId);
    renderMasterPricingPanel(detail.pricingSummary);
    renderLines(detail.estimate?.items || []);
    updateTotalsFromEstimate(detail.estimate);
    hidePdfPreview();
    toast("価格再計算しました");
  } catch (e) {
    toastError(e, e.status);
  }
}

function updateLineListLayout() {
  const el = $("line-list");
  if (!el) return;
  el.classList.toggle("line-list-table-mode", window.innerWidth >= 768);
}

async function importFromMasterDraft(masterDraftId) {
  const detail = await api(`/from-master-draft/${encodeURIComponent(masterDraftId)}`, {
    method: "POST",
    body: "{}",
  });
  toast("マスター候補を見積に反映しました");
  await loadProjects();
  await openDetail(detail.businessProjectId);
  return detail;
}

async function createEstimateFromSurvey(surveyId) {
  toast("見積を作っています…");
  const created = await api(`/from-survey/${surveyId}`, { method: "POST", body: "{}" });
  toast("見積を作りました");
  $("material-candidates-panel")?.classList.add("hidden");
  pendingSurveyForEstimate = null;
  await openDetail(created.businessProjectId);
  await loadPending();
  await loadProjects();
}

async function onPendingClick(node) {
  const surveyId = node.dataset.surveyId;
  const hasEstimate = node.dataset.hasEstimate === "1";
  const bizId = node.dataset.bizId;
  try {
    if (hasEstimate && bizId) {
      await openDetail(bizId);
      return;
    }
    const cand = await api(`/material-candidates/${surveyId}`);
    pendingSurveyForEstimate = surveyId;
    $("material-candidates-body").innerHTML = renderMaterialCandidates(cand.groups);
    $("material-candidates-panel").classList.remove("hidden");
    $("pending-list").classList.add("hidden");
  } catch (e) {
    toastError(e, e.status);
  }
}

function bindLineInputs() {
  $("line-list").querySelectorAll(".qty-input, .price-input, .desc-input, .order-target-input").forEach((inp) => {
    inp.addEventListener("input", () => recalcLocal());
    inp.addEventListener("change", () => recalcLocal());
  });
  $("line-list").querySelectorAll(".line-field-input").forEach((inp) => {
    inp.addEventListener("keydown", (ev) => {
      const field = inp.dataset.field;
      const idx = Number(inp.dataset.idx);
      if (ev.key === "Tab" && !ev.shiftKey) {
        const pos = LINE_FIELD_ORDER.indexOf(field);
        if (pos >= 0 && pos < LINE_FIELD_ORDER.length - 1) {
          ev.preventDefault();
          focusLineField(idx, LINE_FIELD_ORDER[pos + 1]);
          return;
        }
        if (pos === LINE_FIELD_ORDER.length - 1 && idx < currentLines.length - 1) {
          ev.preventDefault();
          focusLineField(idx + 1, LINE_FIELD_ORDER[0]);
        }
      }
      if (ev.key === "Enter" && !ev.shiftKey && field !== "desc") {
        ev.preventDefault();
        const pos = LINE_FIELD_ORDER.indexOf(field);
        if (pos >= 0 && pos < LINE_FIELD_ORDER.length - 1) {
          focusLineField(idx, LINE_FIELD_ORDER[pos + 1]);
          return;
        }
        if (idx === currentLines.length - 1) {
          currentLines.push(newEmptyLine());
          renderLines(currentLines);
          focusLineField(currentLines.length - 1, LINE_FIELD_ORDER[0]);
          return;
        }
        focusLineField(idx + 1, LINE_FIELD_ORDER[0]);
      }
    });
  });
  $("line-list").querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === "delete") {
        if (currentLines.length <= 1) {
          toast("最低1項目は残してください");
          return;
        }
        currentLines.splice(i, 1);
        renderLines(currentLines);
        return;
      }
      if (action === "up" && i > 0) {
        [currentLines[i - 1], currentLines[i]] = [currentLines[i], currentLines[i - 1]];
        renderLines(currentLines);
      }
      if (action === "down" && i < currentLines.length - 1) {
        [currentLines[i + 1], currentLines[i]] = [currentLines[i], currentLines[i + 1]];
        renderLines(currentLines);
      }
    });
  });
}

function renderLines(items) {
  currentLines = (items || []).map((it) => ({ ...it, orderTarget: it.orderTarget === true }));
  if (!currentLines.length) currentLines = [newEmptyLine()];
  const el = $("line-list");
  el.innerHTML = currentLines
    .map(
      (it, i) => `
    <div class="line-item-card line-card" data-idx="${i}">
      <label class="friendly-label line-field-label">項目名</label>
      <textarea class="desc-input line-field-input" data-field="desc" data-idx="${i}" rows="3" placeholder="例：防犯カメラ&#10;LAN配線工事">${escapeHtml(splitDescription(it.name, it.memo))}</textarea>
      <div class="line-metrics-grid">
        <div class="line-metric col-qty">
          <label class="friendly-label line-metric-label">数量</label>
          <input type="number" min="0" step="1" class="qty-input line-field-input" data-field="qty" data-idx="${i}" value="${it.quantity}" inputmode="numeric" />
        </div>
        <div class="line-metric col-price">
          <label class="friendly-label line-metric-label">単価</label>
          <input type="number" min="0" class="price-input line-field-input" data-field="price" data-idx="${i}" value="${it.unitPrice}" inputmode="numeric" />
        </div>
        <div class="line-metric col-amount">
          <span class="line-metric-label">金額</span>
          <div class="line-amount-display">${yen((it.quantity || 0) * (it.unitPrice || 0))}</div>
        </div>
      </div>
      <label class="line-order-target"><input type="checkbox" class="order-target-input" data-idx="${i}" ${it.orderTarget ? "checked" : ""} /> 発注対象</label>
      ${lineMasterMetricsHtml(it)}
      <div class="line-actions">
        <button type="button" data-action="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-action="down" data-idx="${i}" ${i === currentLines.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn-line-delete" data-action="delete" data-idx="${i}">削除</button>
      </div>
    </div>`
    )
    .join("");
  bindLineInputs();
  updateLineListLayout();
  recalcLocal();
}

function readShuseiDiscount() {
  return Math.max(0, Math.round(Number($("shusei-discount")?.value || 0)));
}

function recalcLocal() {
  $("line-list").querySelectorAll(".line-item-card").forEach((row) => {
    const i = Number(row.dataset.idx);
    const qty = Number(row.querySelector(".qty-input")?.value || 1);
    const price = Number(row.querySelector(".price-input")?.value || 0);
    const desc = row.querySelector(".desc-input")?.value || "";
    const orderTarget = row.querySelector(".order-target-input")?.checked === true;
    const parsed = parseDescription(desc);
    if (currentLines[i]) {
      currentLines[i].quantity = qty;
      currentLines[i].unitPrice = price;
      currentLines[i].name = parsed.name;
      currentLines[i].memo = parsed.memo;
      currentLines[i].orderTarget = orderTarget;
      currentLines[i].amount = Math.round(qty * price);
      const amtEl = row.querySelector(".line-amount-display");
      if (amtEl) amtEl.textContent = yen(currentLines[i].amount);
    }
  });
  const lineSubtotal = currentLines.reduce((s, it) => s + (it.amount || 0), 0);
  const discount = readShuseiDiscount();
  const subtotal = Math.max(0, lineSubtotal - discount);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const showDiscount = discount > 0;
  $("total-line-row")?.classList.toggle("hidden", !showDiscount);
  $("total-discount-row")?.classList.toggle("hidden", !showDiscount);
  if ($("total-line")) $("total-line").textContent = yen(lineSubtotal);
  if ($("total-discount")) $("total-discount").textContent = `-${yen(discount)}`;
  $("total-sub").textContent = yen(subtotal);
  $("total-tax").textContent = yen(tax);
  $("total-grand").textContent = yen(total);
  renderShuseiPreview();
  if (currentPriceRule) renderPriceRuleSummary(readSelectedPriceRule(), { shuseiDiscount: discount });
}

function updateTotalsFromEstimate(est) {
  if (!est) return;
  if ($("shusei-discount")) $("shusei-discount").value = String(est.shuseiDiscount ?? 0);
  if ($("shusei-discount-memo")) $("shusei-discount-memo").value = est.shuseiDiscountMemo ?? "";
  recalcLocal();
}

function hidePdfPreview() {
  $("pdf-section").classList.add("hidden");
  $("pdf-preview").src = "about:blank";
  $("pdf-error").classList.remove("visible");
  $("pdf-error").innerHTML = "";
  if (pdfBlobUrl) {
    URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = null;
  }
}

function fillHeaderForm(header) {
  if (!header) return;
  $("hdr-addressee").value = header.addressee || "";
  $("hdr-subject").value = header.subject || "";
  $("hdr-issue-date").value = toDateInputValue(header.issueDate) || todayIsoDate();
  $("hdr-estimate-no").value = header.estimateNo || "";
  $("hdr-staff").value = header.staffName || "";
  $("hdr-work-location").value = header.workLocation || header.siteName || "";
  $("hdr-address").value = header.address || "";
  $("hdr-phone").value = header.phone || "";
  $("hdr-email").value = header.email || "";
  if ($("hdr-notes")) $("hdr-notes").value = header.notes || "";
}

function fillInvoiceHeaderForm(project, invoice) {
  $("invoice-header-fields")?.classList.toggle("hidden", !invoice);
  if (!invoice) {
    renderInvoiceBankPanel(null);
    return;
  }
  if ($("hdr-invoice-date")) {
    $("hdr-invoice-date").value =
      toDateInputValue(invoice.createdAt) || todayIsoDate();
  }
  if ($("hdr-payment-due")) {
    $("hdr-payment-due").value =
      toDateInputValue(invoice.paymentDueDate || project?.paymentDueDate) || "";
  }
  if ($("hdr-invoice-no")) {
    $("hdr-invoice-no").value = invoice.invoiceNo || "";
  }
  renderInvoiceBankPanel(invoice);
}

function readHeaderForm() {
  return {
    addressee: $("hdr-addressee").value.trim(),
    subject: $("hdr-subject").value.trim(),
    issueDate: $("hdr-issue-date").value.trim() || todayIsoDate(),
    estimateNo: $("hdr-estimate-no").value.trim(),
    staffName: $("hdr-staff").value.trim(),
    workLocation: $("hdr-work-location").value.trim(),
    address: $("hdr-address").value.trim(),
    phone: $("hdr-phone").value.trim(),
    email: $("hdr-email").value.trim(),
  };
}

function readInvoiceHeaderForm() {
  return {
    invoiceDate: $("hdr-invoice-date")?.value?.trim() || todayIsoDate(),
    paymentDueDate: $("hdr-payment-due")?.value?.trim() || "",
  };
}

async function saveHeader() {
  const body = {
    ...readHeaderForm(),
    ...(hasInvoice ? readInvoiceHeaderForm() : {}),
  };
  if (isLocalProjectId(currentProjectId)) {
    const draft = saveLocalDraftFromCurrentState();
    return { header: draft?.header || body };
  }
  const result = await api(`/projects/${currentProjectId}/header`, {
    method: "PATCH",
    body: JSON.stringify(body),
    label: "ヘッダー保存",
    timeoutMs: INIT_LOAD_TIMEOUT_MS,
  });
  clearPrefetchPdfCache();
  scheduleDocumentsStatusRefresh();
  return result;
}

/** 緊急修復: 日付変更時の自動保存は無効（手動保存のみ） */
function scheduleHeaderDateSave() {
  /* ENABLE_HEADER_DATE_AUTOSAVE === false */
}

function bindHeaderDateAutoSave() {
  if (!ENABLE_HEADER_DATE_AUTOSAVE) return;
}

function buildPdfUrl(kind) {
  if (kind === "completion") {
    return `/api/estimate/v1/projects/${currentProjectId}/completion-report/pdf`;
  }
  if (kind === "specification") {
    return `/api/estimate/v1/projects/${currentProjectId}/specification/pdf`;
  }
  // regenerate=1 を常時付けない（毎回PDF再生成でサーバー・UIが固まるため）
  return kind === "invoice"
    ? `/api/estimate/v1/projects/${currentProjectId}/invoice/pdf?includePhotos=false`
    : `/api/estimate/v1/projects/${currentProjectId}/pdf?includePhotos=false`;
}

function buildPdfTabUrl(kind, token) {
  const url = buildPdfUrl(kind);
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

const DOC_STATUS_IDS = {
  estimate: "doc-status-estimate",
  invoice: "doc-status-invoice",
  specification: "doc-status-specification",
  completion: "doc-status-completion",
};

function buildPdfFetchUrl(pdfPath) {
  const token = getCustomerToken();
  const sep = pdfPath.includes("?") ? "&" : "?";
  return `${pdfPath}${sep}access_token=${encodeURIComponent(token)}`;
}

function pdfAuthHeaders() {
  return { Authorization: `Bearer ${getCustomerToken()}` };
}

function renderDocumentStatusBadges(documents) {
  for (const doc of documents || []) {
    const el = $(DOC_STATUS_IDS[doc.kind]);
    if (!el) continue;
    const storage = doc.storageStatusIcon && doc.storageStatusLabel
      ? ` ${doc.storageStatusIcon}${doc.storageStatusLabel}`
      : "";
    el.textContent = `${doc.statusIcon} ${doc.statusLabel}${storage}`;
  }
}

function renderDocumentList(documents) {
  const mount = $("doc-list-mount");
  if (!mount) return;
  if (!documents?.length) {
    mount.innerHTML = '<p class="section-hint">書類がありません</p>';
    renderQnapActionBar(documents);
    return;
  }
  mount.innerHTML = documents
    .map(
      (doc) => {
        const storageBadge = doc.storageStatusIcon && doc.storageStatusLabel
          ? `${doc.storageStatusIcon} ${doc.storageStatusLabel}`
          : "";
        const pdfBadge = doc.hasPdf ? "📄 PDFあり" : "";
        const photoBadge = doc.hasPhotos ? "📷 写真あり" : "";
        const badges = [storageBadge, pdfBadge, photoBadge].filter(Boolean).join(" · ");
        const canQnap = doc.hasPdf && doc.storageDocumentId && doc.storageStatus !== "qnap_synced";
        const qnapBtn = doc.storageDocumentId
          ? `<button type="button" class="doc-qnap-row-btn" data-doc-action="qnap-sync" data-kind="${escapeHtml(doc.kind)}" ${canQnap ? "" : "disabled"}>QNAPへ保存</button>`
          : "";
        const pathBtn = doc.qnapPath
          ? `<button type="button" data-doc-action="qnap-path" data-path="${escapeHtml(doc.qnapPath)}">保存先を見る</button>`
          : "";
        return `<div class="doc-list-row" data-doc-kind="${escapeHtml(doc.kind)}">
        <div>
          <strong>${escapeHtml(doc.label)}</strong>
          <div class="doc-list-meta">${escapeHtml(doc.statusIcon)} ${escapeHtml(doc.statusLabel)}${doc.fileName ? ` · ${escapeHtml(doc.fileName)}` : ""}</div>
          ${badges ? `<div class="doc-storage-badges">${escapeHtml(badges)}</div>` : ""}
          ${doc.qnapPath ? `<div class="doc-qnap-path">${escapeHtml(doc.qnapPath)}</div>` : ""}
        </div>
        <div class="doc-list-actions">
          <button type="button" data-doc-action="open" data-kind="${escapeHtml(doc.kind)}" ${doc.status === "not_created" || doc.status === "photos_missing" || doc.status === "completion_photos_missing" ? "disabled" : ""}>開く</button>
          <button type="button" data-doc-action="share" data-kind="${escapeHtml(doc.kind)}" ${!doc.pdfUrl ? "disabled" : ""}>共有</button>
          <button type="button" data-doc-action="save" data-kind="${escapeHtml(doc.kind)}" ${!doc.pdfUrl ? "disabled" : ""}>保存</button>
          ${qnapBtn}
          ${pathBtn}
        </div>
      </div>`;
      }
    )
    .join("");

  mount.querySelectorAll("[data-doc-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-kind");
      const action = btn.getAttribute("data-doc-action");
      if (action === "open") openDocumentViewer(kind);
      else if (action === "share") shareDocumentFromList(kind);
      else if (action === "save") saveDocumentFromList(kind);
      else if (action === "qnap-sync") syncDocumentToQnap(kind);
      else if (action === "qnap-path") showQnapPath(btn.getAttribute("data-path"));
    });
  });
  renderQnapActionBar(documents);
}

function renderQnapActionBar(documents) {
  const mount = $("doc-qnap-mount");
  if (!mount) return;
  const configured = documentsStatus?.qnapConfigured !== false || documentsStatus?.qnapProviderKind === "mock";
  const hasFailed = (documents || []).some((d) => d.storageStatus === "qnap_failed");
  const hasPending = (documents || []).some(
    (d) => d.hasPdf && (d.storageStatus === "qnap_pending" || d.storageStatus === "qnap_failed")
  );
  if (!currentProjectId) {
    mount.hidden = true;
    return;
  }
  mount.hidden = false;
  const configHint = configured
    ? `<p class="section-hint" style="margin:0;">保存先: ${escapeHtml(documentsStatus?.qnapProviderKind || "mock")}</p>`
    : `<p class="section-hint" style="margin:0;">⚙️ QNAP未設定 — Mock でテスト可能</p>`;
  mount.innerHTML = `
    ${configHint}
    <button type="button" id="btn-qnap-sync-project" ${hasPending ? "" : "disabled"}>案件まとめて保存</button>
    <button type="button" class="secondary" id="btn-qnap-retry-failed" ${hasFailed ? "" : "disabled"}>失敗分を再試行</button>
  `;
  $("btn-qnap-sync-project")?.addEventListener("click", () => syncProjectToQnap());
  $("btn-qnap-retry-failed")?.addEventListener("click", () => retryFailedQnap());
}

async function resolveDocumentIdForKind(kind) {
  const doc = findDocumentStatus(kind);
  if (doc?.storageDocumentId) return doc.storageDocumentId;
  const res = await storageApi(`/document-id/${encodeURIComponent(currentProjectId)}/${encodeURIComponent(kind)}`);
  return res.documentId;
}

async function syncDocumentToQnap(kind) {
  if (!currentProjectId) return;
  try {
    toast("QNAPへ保存中…");
    const documentId = await resolveDocumentIdForKind(kind);
    const result = await storageApi(`/sync/${encodeURIComponent(documentId)}`, {
      method: "POST",
      body: "{}",
    });
    if (result.ok) toast("QNAP保存完了");
    else toast(result.errorMessage || "QNAP保存失敗");
    await loadDocumentsStatus();
  } catch (e) {
    toastError(e, e.status);
  }
}

async function syncProjectToQnap() {
  if (!currentProjectId) return;
  try {
    toast("案件書類をQNAPへ保存中…");
    const result = await storageApi(`/sync-project/${encodeURIComponent(currentProjectId)}`, {
      method: "POST",
      body: "{}",
    });
    toast(`保存完了 ${result.synced?.length ?? 0}件 / 失敗 ${result.failed?.length ?? 0}件`);
    await loadDocumentsStatus();
  } catch (e) {
    toastError(e, e.status);
  }
}

async function retryFailedQnap() {
  if (!currentProjectId) return;
  try {
    const result = await storageApi("/retry-failed", {
      method: "POST",
      body: JSON.stringify({ projectId: currentProjectId }),
    });
    toast(`再試行 ${result.retried}件 — 成功 ${result.synced?.length ?? 0}件`);
    await loadDocumentsStatus();
  } catch (e) {
    toastError(e, e.status);
  }
}

function showQnapPath(pathValue) {
  if (!pathValue) {
    toast("保存先パスがありません");
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(pathValue).then(() => toast(`保存先をコピー: ${pathValue}`)).catch(() => toast(pathValue));
  } else {
    toast(pathValue);
  }
}

function findDocumentStatus(kind) {
  return documentsStatus?.documents?.find((d) => d.kind === kind) || null;
}

async function loadDocumentsStatus() {
  if (!currentProjectId) return;
  const mount = $("doc-list-mount");
  try {
    const data = await api(`/projects/${currentProjectId}/documents-status`, {
      label: "書類状態",
      timeoutMs: 15_000,
    });
    documentsStatus = data;
    renderDocumentStatusBadges(data.documents);
    renderDocumentList(data.documents);
  } catch (e) {
    console.warn("[estimate-v1] documents-status failed", e);
    if (mount?.textContent?.includes("読み込み中")) {
      mount.innerHTML =
        '<p class="section-hint">書類状態を取得できませんでした。再読み込みしてください。</p>';
    }
  } finally {
    if (mount?.textContent?.includes("読み込み中")) {
      mount.innerHTML = '<p class="section-hint">書類がありません</p>';
    }
  }
}

function scheduleDocumentsStatusRefresh() {
  clearTimeout(documentsStatusTimer);
  documentsStatusTimer = setTimeout(() => {
    loadDocumentsStatus().catch(() => {});
  }, 400);
}

async function prefetchProjectPdfsBackground() {
  if (!currentProjectId || prefetchInFlight) return prefetchInFlight;
  // クライアント側の個別PDF先読みはしない（regenerate 連鎖・モバイル固まり防止）
  // サーバー側 prefetch のみ（stale なPDFだけ再生成）
  prefetchInFlight = api(`/projects/${currentProjectId}/pdfs/prefetch`, {
    method: "POST",
    body: "{}",
    label: "PDF先読み",
    timeoutMs: 20_000,
  })
    .then(() => loadDocumentsStatus())
    .catch(() => {})
    .finally(() => {
      prefetchInFlight = null;
    });
  return prefetchInFlight;
}

async function shareDocumentFromList(kind) {
  const doc = findDocumentStatus(kind);
  if (!doc?.pdfUrl) {
    toast("PDFがありません");
    return;
  }
  const fileName = doc.shareFileName || `${doc.label}.pdf`;
  try {
    await sharePdfAsFile({
      fetchUrl: buildPdfFetchUrl(doc.pdfUrl),
      fileName,
      title: doc.label,
      getHeaders: pdfAuthHeaders,
      toast,
    });
    await api(`/projects/${currentProjectId}/pdf-share-log`, {
      method: "POST",
      body: JSON.stringify({ documentKind: doc.viewerKind || kind, fileName }),
    }).catch(() => {});
  } catch (e) {
    if (e?.name !== "AbortError") toastError(e, e.status);
  }
}

async function saveDocumentFromList(kind) {
  const doc = findDocumentStatus(kind);
  if (!doc?.pdfUrl) {
    toast("PDFがありません");
    return;
  }
  const fileName = doc.shareFileName || `${doc.label}.pdf`;
  try {
    const blob = await prefetchPdfForShare({
      fetchUrl: buildPdfFetchUrl(doc.pdfUrl),
      getHeaders: pdfAuthHeaders,
    });
    triggerDownload(blob, fileName);
    toast("PDFを保存しました");
  } catch (e) {
    toastError(e, e.status);
  }
}

const PDF_LABELS = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  completion: "完了報告書",
};

const DOC_VIEWER_KINDS = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  completion: "completion-report",
};

function buildDocumentViewerUrl(kind, { receipt = false } = {}) {
  const viewerKind = DOC_VIEWER_KINDS[kind] || kind;
  const params = new URLSearchParams({
    projectId: currentProjectId,
    kind: viewerKind,
    return: `${window.location.pathname}${window.location.search}`,
  });
  if (receipt) params.set("receipt", "1");
  return `/document-viewer-v1.html?${params}`;
}

async function openDocumentViewer(kind, { receipt = false } = {}) {
  if (!currentProjectId) return;
  if (kind === "invoice" && !hasInvoice) {
    toast("先に請求書を作成してください");
    return;
  }
  try {
    if (kind === "estimate" || kind === "invoice") {
      await saveHeader().catch(() => ({}));
      await saveItems().catch(() => ({}));
      clearPrefetchPdfCache();
    }
    navigateTo(buildDocumentViewerUrl(kind, { receipt }));
  } catch (e) {
    toastError(e, e.status);
  }
}

function renderCustomerInfo(p) {
  const parts = [
    p.siteName && `現場: ${p.siteName}`,
    p.address && `工事場所: ${p.address}`,
    p.contactName && `担当: ${p.contactName}`,
    p.phone && `TEL: ${p.phone}`,
    p.email && `Email: ${p.email}`,
  ].filter(Boolean);
  $("detail-customer-info").innerHTML = parts.map((x) => escapeHtml(x)).join(" · ");
}

function isLaborLineName(name, category) {
  if (category === "labor") return true;
  return /労務|工事|設置|配線/.test(String(name || ""));
}

function isPriceRuleTargetLineLocal(item) {
  const baseCost = item.costPrice ?? 0;
  if (baseCost <= 0) return false;
  if (isLaborLineName(item.name, item.category)) return true;
  if (item.category === "other") return false;
  return true;
}

function expectedUnitPriceLocal(item, rule) {
  if (!rule || rule.ruleName === "手動調整") return null;
  if (!isPriceRuleTargetLineLocal(item)) return null;
  const baseCost = item.costPrice ?? 0;
  const mult = isLaborLineName(item.name, item.category) ? rule.laborMultiplier : rule.costMultiplier;
  return Math.round(baseCost * mult);
}

function readMultiplierInputs() {
  const cost = Number($("cost-multiplier")?.value);
  const labor = Number($("labor-multiplier")?.value);
  return {
    costMultiplier: Number.isFinite(cost) && cost > 0 ? cost : null,
    laborMultiplier: Number.isFinite(labor) && labor > 0 ? labor : null,
  };
}

function syncMultiplierInputsFromRule(rule, preset) {
  const costEl = $("cost-multiplier");
  const laborEl = $("labor-multiplier");
  const isManual = preset?.ruleName === "手動調整" || rule?.ruleName === "手動調整";
  const costVal = preset?.costMultiplier ?? rule?.costMultiplier ?? "";
  const laborVal = preset?.laborMultiplier ?? rule?.laborMultiplier ?? "";
  if (costEl) {
    costEl.disabled = isManual;
    costEl.value = isManual ? "" : String(costVal);
  }
  if (laborEl) {
    laborEl.disabled = isManual;
    laborEl.value = isManual ? "" : String(laborVal);
  }
}

function findPresetByRuleName(ruleName) {
  return priceRulePresets.find((p) => p.ruleName === ruleName);
}

function matchPresetOption(rule) {
  if (!rule) return priceRulePresets.find((p) => p.id === "manual") || null;
  const exact = findPresetByRuleName(rule.ruleName);
  if (exact) return exact;
  return priceRulePresets.find((p) => p.id === "manual") || null;
}

function populatePriceRuleSelect(rule) {
  const sel = $("price-rule-select");
  if (!sel) return;
  if (!priceRulePresets.length) {
    sel.innerHTML = '<option value="">読み込み中…</option>';
    return;
  }
  sel.innerHTML = priceRulePresets
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`)
    .join("");
  const matched = matchPresetOption(rule);
  if (matched) sel.value = matched.id;
  syncMultiplierInputsFromRule(rule, matched);
}

function readSelectedPriceRule() {
  const sel = $("price-rule-select");
  const preset = priceRulePresets.find((p) => p.id === sel?.value);
  if (!preset) return currentPriceRule;
  if (preset.ruleName === "手動調整") {
    return { ruleName: "手動調整", costMultiplier: null, laborMultiplier: null };
  }
  const mult = readMultiplierInputs();
  return {
    ruleName: preset.ruleName,
    costMultiplier: mult.costMultiplier ?? preset.costMultiplier,
    laborMultiplier: mult.laborMultiplier ?? preset.laborMultiplier,
  };
}

function renderPriceRuleSummary(rule, estimate) {
  const summary = $("price-rule-summary");
  if (!summary) return;
  if (!rule) {
    summary.textContent = "";
    return;
  }
  const lines = [`単価ルール：${rule.ruleName}`];
  if (rule.ruleName !== "手動調整") {
    lines.push(`材料：原価 × ${rule.costMultiplier}`);
    lines.push(`労務：原価 × ${rule.laborMultiplier}`);
  } else {
    lines.push("単価は手入力で調整します");
  }
  const discount = estimate?.shuseiDiscount ?? readShuseiDiscount();
  const memo = estimate?.shuseiDiscountMemo ?? $("shusei-discount-memo")?.value?.trim() ?? "";
  if (discount > 0) {
    lines.push(`出精値引き：-${discount.toLocaleString("ja-JP")}円`);
    if (memo) lines.push(`理由：${memo}`);
  }
  summary.textContent = lines.join("\n");
}

function renderShuseiPreview() {
  const el = $("shusei-discount-preview");
  if (!el) return;
  const discount = readShuseiDiscount();
  const memo = $("shusei-discount-memo")?.value?.trim() ?? "";
  if (discount <= 0) {
    el.textContent = "";
    return;
  }
  const lines = [`出精値引き：-${discount.toLocaleString("ja-JP")}円`];
  if (memo) lines.push(`理由：${memo}`);
  el.textContent = lines.join("\n");
}

function renderPriceRulePanel(p) {
  const panel = $("price-rule-panel");
  if (!panel) return;
  currentCustomerName = projectListTitle(p);
  const customerEl = $("price-rule-customer");
  if (customerEl) customerEl.textContent = currentCustomerName ? `顧客：${currentCustomerName}` : "";
  currentPriceRule = p.priceRule || null;
  populatePriceRuleSelect(currentPriceRule);
  renderPriceRuleSummary(currentPriceRule, p.estimate);
  renderShuseiPreview();
}

async function loadPriceRulePresets() {
  try {
    const data = await api("/price-rules");
    priceRulePresets = data.presets || [];
  } catch (e) {
    console.warn("[estimate-v1] price-rules load failed", e);
    priceRulePresets = [
      { id: "manual", label: "手動調整", ruleName: "手動調整", costMultiplier: 1, laborMultiplier: 1 },
    ];
  }
}

async function patchItems(body) {
  if (isLocalProjectId(currentProjectId)) {
    const draft = getLocalDraft(currentProjectId);
    if (draft) {
      draft.estimate = {
        ...(draft.estimate || {}),
        items: body.items || currentLines,
        shuseiDiscount: body.shuseiDiscount ?? 0,
        shuseiDiscountMemo: body.shuseiDiscountMemo ?? "",
      };
      draft.estimateNotes = body.notes ?? draft.estimateNotes ?? "";
      draft.updatedAt = new Date().toISOString();
      upsertLocalDraft(draft);
      return { estimate: draft.estimate };
    }
  }

  // オフライン時はローカル保持 + 同期キューへ追記
  if (!isOnlineV1()) {
    savePendingOverlay(currentProjectId, body);
    await enqueueOfflineSyncV1({
      kind: "estimate_items",
      url: `${API}/projects/${currentProjectId}/items`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getCustomerToken()}`,
      },
      body,
      meta: { projectId: currentProjectId },
    });
    toast("オフライン保存しました（復帰後に同期）");
    return { estimate: { items: body.items || currentLines, queued: true } };
  }

  const res = await fetch(`${API}/projects/${currentProjectId}/items`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCustomerToken()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 電波瞬断時も既存明細を壊さずキューへ退避
    if (res.status === 0 || res.status >= 500) {
      savePendingOverlay(currentProjectId, body);
      await enqueueOfflineSyncV1({
        kind: "estimate_items",
        url: `${API}/projects/${currentProjectId}/items`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getCustomerToken()}`,
        },
        body,
        meta: { projectId: currentProjectId, httpStatus: res.status },
      });
      toast("通信失敗のため端末に退避しました");
      return { estimate: { items: body.items || currentLines, queued: true } };
    }
    const e = new Error(data.error || data.message || `HTTP ${res.status}`);
    e.status = res.status;
    e.manualLineIndices = data.manualLineIndices;
    throw e;
  }
  return data;
}

async function recalcWithPriceRule(forceOverwrite = false) {
  if (!currentProjectId) return;
  recalcLocal();
  const priceRule = readSelectedPriceRule();
  if (priceRule?.ruleName === "手動調整") {
    toast("手動調整モードです。単価は自動では変わりません");
    return;
  }
  try {
    const result = await patchItems({
      items: currentLines,
      notes: $("estimate-notes").value.trim(),
      shuseiDiscount: readShuseiDiscount(),
      shuseiDiscountMemo: $("shusei-discount-memo")?.value.trim() ?? "",
      applyPriceRule: true,
      forceOverwriteManualLines: forceOverwrite,
      priceRule,
    });
    renderLines(result.estimate.items || []);
    updateTotalsFromEstimate(result.estimate);
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, result.estimate);
    hidePdfPreview();
    toast("倍率で再計算しました");
  } catch (e) {
    if (e.status === 409 && e.message === "manual_price_lines") {
      const ok = window.confirm("手入力の単価があります。上書きしますか？");
      if (ok) await recalcWithPriceRule(true);
      return;
    }
    toastError(e, e.status);
  }
}

function isLikelyImageFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "");
  if (type.startsWith("image/")) return true;
  if ((type === "" || type === "application/octet-stream") && IMAGE_EXT_RE.test(name)) return true;
  return false;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file) {
  return readFileAsDataUrl(file).then((dataUrl) => {
    const b64 = String(dataUrl).split(",")[1];
    if (!b64) throw new Error("base64 empty");
    return b64;
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image decode failed"));
    el.src = dataUrl;
  });
}

function isHeicLike(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || /\.heic$|\.heif$/.test(name);
}

async function decodeImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() };
    } catch (err) {
      console.warn("[estimate-v1] createImageBitmap failed", err, file.name);
    }
  }
  const dataUrl = String(await readFileAsDataUrl(file));
  const img = await loadImageFromDataUrl(dataUrl);
  return { source: img, width: img.width, height: img.height, cleanup: () => {} };
}

function canvasToJpegBase64(canvas, quality = 0.82) {
  const out = canvas.toDataURL("image/jpeg", quality);
  const b64 = out.split(",")[1];
  if (!b64 || b64.length < 16) throw new Error("compression failed");
  return b64;
}

async function compressImage(file, maxWidth = 1600, quality = 0.82) {
  const decoded = await decodeImageSource(file);
  try {
    let width = decoded.width;
    let height = decoded.height;
    if (!width || !height) throw new Error("invalid image dimensions");
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(decoded.source, 0, 0, width, height);
    return canvasToJpegBase64(canvas, quality);
  } finally {
    decoded.cleanup();
  }
}

async function fileToUploadBase64(file) {
  try {
    return await compressImage(file);
  } catch (compressErr) {
    console.warn("[estimate-v1] compress failed", compressErr, file.name);
    if (isHeicLike(file)) throw Object.assign(new Error("heic decode failed"), { status: 400, heic: true });
    return readFileAsBase64(file);
  }
}

function revokeCompletionPendingPreviews() {
  completionPendingPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  completionPendingPreviewUrls = [];
}

function showCompletionTitleStatus(photoId, msg, isError = false) {
  const el = document.querySelector(`.completion-title-status[data-photo-id="${photoId}"]`);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b91c1c" : "#64748b";
}

function openCompletionLightbox(url) {
  const box = $("completion-photo-lightbox");
  const img = $("completion-lightbox-img");
  if (!box || !img || !url) return;
  img.src = url;
  box.classList.remove("hidden");
}

function closeCompletionLightbox() {
  const box = $("completion-photo-lightbox");
  const img = $("completion-lightbox-img");
  if (!box || !img) return;
  box.classList.add("hidden");
  img.src = "";
}

function renderCompletionPhotos(pendingFiles = []) {
  const el = $("completion-photo-list");
  if (!el) return;
  const pendingHtml = pendingFiles
    .map((file) => {
      const url = URL.createObjectURL(file);
      completionPendingPreviewUrls.push(url);
      return `<div class="completion-photo-card photo-pending"><button type="button" class="completion-photo-preview-btn" tabindex="-1"><img src="${url}" alt="" /></button><p class="survey-photo-hint" style="margin:0.35rem 0 0;">送信中…</p></div>`;
    })
    .join("");
  if (!completionPhotos.length && !pendingHtml) {
    el.innerHTML =
      '<p class="photo-guide-tip" style="margin:0;">完了報告書用の写真を追加してください。現調写真は含まれません。</p>';
    return;
  }
  el.innerHTML =
    pendingHtml +
    completionPhotos
    .map((ph, idx) => {
      const canUp = idx > 0;
      const canDown = idx < completionPhotos.length - 1;
      return `
    <div class="completion-photo-card" data-photo-id="${ph.id}">
      <button type="button" class="completion-photo-preview-btn" data-photo-url="${escapeHtml(ph.url)}" aria-label="写真を拡大表示">
        <img src="${escapeHtml(ph.url)}" alt="" loading="lazy" decoding="async" />
      </button>
      <label class="friendly-label" style="margin:0.35rem 0 0;">タイトル
        <input type="text" class="completion-title-input" data-photo-id="${ph.id}" value="${escapeHtml(ph.title || "")}" maxlength="120" inputmode="text" enterkeyhint="done" autocomplete="off" />
        <span class="completion-title-status" data-photo-id="${ph.id}" aria-live="polite"></span>
      </label>
      <div class="completion-photo-actions">
        <button type="button" class="btn-sub btn-small completion-reorder-btn" data-photo-id="${ph.id}" data-direction="up" ${canUp ? "" : "disabled"}>↑ 上へ</button>
        <button type="button" class="btn-sub btn-small completion-reorder-btn" data-photo-id="${ph.id}" data-direction="down" ${canDown ? "" : "disabled"}>↓ 下へ</button>
        <button type="button" class="btn-sub btn-small btn-del-completion-photo" data-photo-id="${ph.id}">削除</button>
      </div>
    </div>`;
    })
    .join("");
  el.querySelectorAll(".completion-photo-preview-btn[data-photo-url]").forEach((btn) => {
    btn.addEventListener("click", () => openCompletionLightbox(btn.dataset.photoUrl));
  });
  el.querySelectorAll(".completion-title-input").forEach((inp) => {
    const photoId = inp.dataset.photoId;
    const persistTitle = async () => {
      const title = inp.value;
      if (completionTitleLastSaved.get(photoId) === title) return;
      try {
        await api(`/projects/${currentProjectId}/completion-photos/${photoId}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        });
        completionTitleLastSaved.set(photoId, title);
        const ph = completionPhotos.find((p) => p.id === photoId);
        if (ph) ph.title = title;
        showCompletionTitleStatus(photoId, COMPLETION_TITLE_SAVE_OK);
      } catch (e) {
        showCompletionTitleStatus(photoId, "保存に失敗しました", true);
        toastError(e, e.status);
      }
    };
    inp.addEventListener("input", () => {
      showCompletionTitleStatus(photoId, "");
      if (completionTitleTimers.has(photoId)) clearTimeout(completionTitleTimers.get(photoId));
      completionTitleTimers.set(
        photoId,
        setTimeout(async () => {
          completionTitleTimers.delete(photoId);
          await persistTitle();
        }, 600)
      );
    });
    inp.addEventListener("blur", async () => {
      if (completionTitleTimers.has(photoId)) {
        clearTimeout(completionTitleTimers.get(photoId));
        completionTitleTimers.delete(photoId);
      }
      await persistTitle();
    });
  });
  el.querySelectorAll(".completion-reorder-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      await moveCompletionPhoto(btn.dataset.photoId, btn.dataset.direction);
    });
  });
  el.querySelectorAll(".btn-del-completion-photo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const photoId = btn.dataset.photoId;
      if (!confirm("この写真を削除しますか？")) return;
      try {
        await api(`/projects/${currentProjectId}/completion-photos/${photoId}`, { method: "DELETE" });
        completionPhotos = completionPhotos.filter((p) => p.id !== photoId);
        completionTitleLastSaved.delete(photoId);
        renderCompletionPhotos();
        hidePdfPreview();
        toast("写真を削除しました");
      } catch (e) {
        toastError(e, e.status);
      }
    });
  });
}

async function moveCompletionPhoto(photoId, direction) {
  if (!currentProjectId || !photoId) return;
  const idx = completionPhotos.findIndex((p) => p.id === photoId);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= completionPhotos.length) return;

  const next = completionPhotos.slice();
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  completionPhotos = next;
  renderCompletionPhotos();

  try {
    const result = await api(`/projects/${currentProjectId}/completion-photos/${photoId}/move`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    });
    if (Array.isArray(result.photos)) {
      completionPhotos = result.photos;
      for (const ph of completionPhotos) {
        completionTitleLastSaved.set(ph.id, ph.title || "");
      }
      renderCompletionPhotos();
      hidePdfPreview();
    }
  } catch (e) {
    await loadCompletionPhotos();
    toastError(e, e.status);
  }
}

async function loadCompletionPhotos() {
  if (!currentProjectId) return;
  const data = await api(`/projects/${currentProjectId}/completion-photos`);
  completionPhotos = data.photos || [];
  for (const ph of completionPhotos) {
    completionTitleLastSaved.set(ph.id, ph.title || "");
  }
  renderCompletionPhotos();
  await refreshCompletionSlotBadge();
}

async function refreshCompletionSlotBadge() {
  const badge = $("completion-slot-badge");
  const pdfBadge = $("completion-pdf-slot-badge");
  if (!currentProjectId) {
    badge?.setAttribute("hidden", "");
    pdfBadge?.setAttribute("hidden", "");
    return;
  }
  try {
    const token = getCustomerToken();
    const res = await fetch(
      `${AUTOMATION_API}/projects/${encodeURIComponent(currentProjectId)}/completion-report-photos`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json().catch(() => ({}));
    const photos = data.photos ?? [];
    const show = photos.length > 0;
    if (badge) {
      badge.hidden = !show;
      badge.classList.toggle("practical-hidden", !show);
    }
    if (pdfBadge) pdfBadge.hidden = !show;
  } catch {
    badge?.setAttribute("hidden", "");
    pdfBadge?.setAttribute("hidden", "");
  }
}

function makeReportApiFetch() {
  return async (path, opts = {}) => {
    const token = getCustomerToken();
    const res = await fetch(path.startsWith("/") ? path : `${WORK_API}${path}`, {
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
}

async function uploadCompletionPhotos(files) {
  if (!currentProjectId || !files?.length) return;
  const imageFiles = [...files].filter(isLikelyImageFile);
  if (!imageFiles.length) {
    toast(COMPLETION_PHOTO_FAIL_MSG);
    return;
  }
  const room = MAX_COMPLETION_PHOTOS - completionPhotos.length;
  if (room <= 0) {
    toast(`写真は最大${MAX_COMPLETION_PHOTOS}枚までです`);
    return;
  }
  const batch = imageFiles.slice(0, room);
  if (batch.length < imageFiles.length) {
    toast(`残り${room}枚分だけ追加します（上限${MAX_COMPLETION_PHOTOS}枚）`);
  }
  revokeCompletionPendingPreviews();
  renderCompletionPhotos(batch);
  toast("写真をアップロード中…");
  let done = 0;
  let failed = false;
  for (const file of batch) {
    try {
      const imageBase64 = await fileToUploadBase64(file);
      const photo = await api(`/projects/${currentProjectId}/completion-photos`, {
        method: "POST",
        body: JSON.stringify({
          imageBase64,
          fileName: (file.name || "photo").replace(/\.[^.]+$/, ".jpg"),
          title: "",
        }),
      });
      completionPhotos.push(photo);
      completionTitleLastSaved.set(photo.id, photo.title || "");
      done += 1;
      revokeCompletionPendingPreviews();
      renderCompletionPhotos(batch.slice(done));
    } catch (e) {
      failed = true;
      console.error("[estimate-v1] completion photo upload failed", e, file.name);
    }
  }
  revokeCompletionPendingPreviews();
  renderCompletionPhotos();
  hidePdfPreview();
  if (done > 0) {
    toast(
      failed
        ? `${done}枚追加（一部失敗）`
        : "写真を追加しました。タイトルに作業内容を入れてください"
    );
    scheduleDocumentsStatusRefresh();
    prefetchProjectPdfsBackground();
  } else toast(COMPLETION_PHOTO_FAIL_MSG);
}

function renderStandalonePreview() {
  /* removed — standalone creates header-only docs */
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY/MM/DD・ISO・その他を <input type="date"> 用 YYYY-MM-DD へ */
function toDateInputValue(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function renderCustomerSuggestList(el, suggestions, onPick) {
  if (!el) return;
  if (!suggestions?.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = suggestions
    .map(
      (s, i) =>
        `<li data-suggest-idx="${i}"><strong>${escapeHtml(s.name)}</strong>${s.contactName ? ` · ${escapeHtml(s.contactName)}` : ""}${s.address ? `<br><span style="color:#64748b;font-size:0.8rem;">${escapeHtml(s.address)}</span>` : ""}</li>`
    )
    .join("");
  el.querySelectorAll("li").forEach((node) => {
    node.addEventListener("click", () => {
      const s = suggestions[Number(node.dataset.suggestIdx)];
      if (s) onPick(s);
      el.classList.add("hidden");
    });
  });
}

async function fetchCustomerSuggestions(query) {
  if (!query || query.trim().length < 1) return [];
  const data = await api(`/customers/suggest?q=${encodeURIComponent(query.trim())}`);
  return data.suggestions || [];
}

function bindCustomerSuggest(inputEl, listEl, onPick) {
  if (!inputEl || !listEl) return;
  inputEl.addEventListener("input", () => {
    clearTimeout(customerSuggestTimer);
    const q = inputEl.value.trim();
    if (q.length < 1) {
      listEl.classList.add("hidden");
      return;
    }
    customerSuggestTimer = setTimeout(async () => {
      try {
        const suggestions = await fetchCustomerSuggestions(q);
        renderCustomerSuggestList(listEl, suggestions, onPick);
      } catch {
        listEl.classList.add("hidden");
      }
    }, 220);
  });
  inputEl.addEventListener("blur", () => {
    setTimeout(() => listEl.classList.add("hidden"), 180);
  });
}

async function loadLineTemplates() {
  try {
    const data = await api("/line-templates");
    lineTemplates = data.templates || [];
    const sel = $("line-template-select");
    if (!sel) return;
    sel.innerHTML =
      `<option value="">よく使うテンプレート…</option>` +
      lineTemplates.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
  } catch {
    /* optional */
  }
}

function resetStandaloneForm(mode) {
  standaloneMode = mode;
  const isInvoice = mode === "invoice";
  $("standalone-form-title").textContent = isInvoice ? "新規請求書" : "新規見積";
  $("standalone-addressee").value = "";
  $("standalone-staff").value = "";
  $("standalone-subject").value = "";
  $("standalone-work-location").value = "";
  $("standalone-notes").value = "";
  $("standalone-invoice-date").value = todayIsoDate();
  $("standalone-payment-due").value = "";
  $("standalone-invoice-fields")?.classList.toggle("hidden", !isInvoice);
  $("standalone-work-location-wrap")?.classList.toggle("hidden", isInvoice);
  $("standalone-customer-suggest")?.classList.add("hidden");
  $("standalone-form-panel")?.classList.remove("hidden");
  $("pending-list")?.classList.add("hidden");
  $("project-list")?.classList.add("hidden");
  $("invoice-list")?.classList.add("hidden");
  document.querySelector(".tab-row")?.classList.add("hidden");
}

function hideStandaloneForm() {
  $("standalone-form-panel")?.classList.add("hidden");
  document.querySelector(".tab-row")?.classList.remove("hidden");
  refreshListTabVisibility();
}

function addStandaloneDraftLine() {
  /* removed */
}

async function submitStandaloneForm() {
  const addressee = $("standalone-addressee")?.value?.trim();
  const subject = $("standalone-subject")?.value?.trim();
  const staffName = $("standalone-staff")?.value?.trim() ?? "";
  const workLocation = $("standalone-work-location")?.value?.trim() ?? "";
  const notes = $("standalone-notes")?.value?.trim() ?? "";
  if (!addressee || !subject) {
    toast("宛名と件名を入力してください");
    return;
  }
  const path =
    standaloneMode === "invoice" ? "/standalone-invoice" : "/standalone-estimate";
  const body =
    standaloneMode === "invoice"
      ? {
          addressee,
          subject,
          staffName,
          notes,
          invoiceDate: $("standalone-invoice-date")?.value || todayIsoDate(),
          paymentDueDate: $("standalone-payment-due")?.value || "",
          items: [],
        }
      : {
          addressee,
          subject,
          staffName,
          workLocation,
          notes,
          items: [],
        };
  try {
    toast("作成中…");
    const detail = await api(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    hideStandaloneForm();
    toast(standaloneMode === "invoice" ? "請求書を作成しました" : "見積を作成しました");
    await loadProjects();
    await loadInvoices();
    await openDetail(detail.businessProjectId);
  } catch (e) {
    console.warn("[estimate-v1] standalone API failed, using localStorage fallback", e);
    const draft = createLocalDraftFromStandalone(standaloneMode, body);
    hideStandaloneForm();
    toast("オフラインで保存しました（端末内）");
    await loadProjects();
    await loadInvoices();
    await openDetail(draft.businessProjectId);
  }
}

async function openDetail(projectId) {
  currentProjectId = projectId;
  showView("detail");
  $("toms-section").classList.add("hidden");
  lastTomsData = null;
  hidePdfPreview();
  showPdfQuickError("");
  completionPhotos = [];
  const mount = $("doc-list-mount");
  if (mount) mount.innerHTML = '<p class="section-hint">読み込み中…</p>';
  if (isLocalProjectId(projectId)) {
    const draft = getLocalDraft(projectId);
    if (!draft) {
      toast("ローカル草稿が見つかりません");
      if (mount) mount.innerHTML = `<p class="section-hint">${FETCH_FAIL_HINT}</p>`;
      showView("list");
      return;
    }
    const p = localDraftAsProject(draft);
    $("detail-name").textContent = projectListTitle(p);
    renderMasterDraftBadge(null);
    await loadMasterPricingSummary(null);
    renderCustomerInfo(p);
    renderPriceRulePanel(p);
    $("detail-status").textContent = "オフライン保存";
    $("detail-status").className = "status-badge orange";
    hasInvoice = Boolean(p.invoice);
    currentSurveyProjectId = null;
    $("detail-meta").textContent = `${p.projectNo} · 端末内保存`;
    $("estimate-notes").value = p.estimateNotes || "";
    if ($("hdr-notes") && p.estimateNotes) $("hdr-notes").value = p.estimateNotes;
    fillHeaderForm(p.header);
    fillInvoiceHeaderForm(p, p.invoice);
    $("btn-invoice")?.classList.toggle("hidden", hasInvoice);
    renderLines(p.estimate?.items || [newEmptyLine()]);
    if ($("shusei-discount")) $("shusei-discount").value = String(p.estimate?.shuseiDiscount ?? 0);
    if ($("shusei-discount-memo")) $("shusei-discount-memo").value = p.estimate?.shuseiDiscountMemo ?? "";
    updateTotalsFromEstimate(p.estimate);
    if (mount) {
      mount.innerHTML =
        '<p class="section-hint">端末内保存のためPDFはサーバー保存後に作成できます</p>';
    }
    return;
  }
  try {
    const p = await api(`/projects/${projectId}`, { label: "案件詳細", timeoutMs: INIT_LOAD_TIMEOUT_MS });
    $("detail-name").textContent = projectListTitle(p);
    renderMasterDraftBadge(p.masterDraftId);
    await loadMasterPricingSummary(p.masterDraftId);
    renderCustomerInfo(p);
    renderPriceRulePanel(p);
    const statusEl = $("detail-status");
    if (p.pdfPath) {
      statusEl.textContent = "見積書の準備ができました";
      statusEl.className = "status-badge done";
    } else {
      statusEl.textContent = p.estimate ? "下書き" : "未作成";
      statusEl.className = "status-badge orange";
    }
    hasInvoice = Boolean(p.invoice);
    currentSurveyProjectId = p.surveyProjectId || null;
    const metaParts = [p.projectNo, p.estimate?.estimateNo].filter(Boolean);
    $("detail-meta").textContent = metaParts.join(" · ");
    $("estimate-notes").value = p.estimateNotes || "";
    if ($("hdr-notes") && p.estimateNotes) $("hdr-notes").value = p.estimateNotes;
    fillHeaderForm(p.header);
    fillInvoiceHeaderForm(p, p.invoice);
    $("btn-invoice")?.classList.toggle("hidden", hasInvoice);
    renderLines(p.estimate?.items || []);
    if ($("shusei-discount")) $("shusei-discount").value = String(p.estimate?.shuseiDiscount ?? 0);
    if ($("shusei-discount-memo")) $("shusei-discount-memo").value = p.estimate?.shuseiDiscountMemo ?? "";
    updateTotalsFromEstimate(p.estimate);
    const surveyLink = $("link-survey-photos");
    if (surveyLink) {
      surveyLink.href = p.surveyProjectId
        ? `/survey-v1?project=${encodeURIComponent(p.surveyProjectId)}`
        : "/survey-v1";
    }
    // 写真・書類は待たない（失敗しても明細操作は可能）
    loadCompletionPhotos().catch((e) => console.warn("[estimate-v1] completion photos", e));
    loadDocumentsStatus().catch((e) => console.warn("[estimate-v1] documents status", e));
    prefetchProjectPdfsBackground();
  } catch (e) {
    toastError(e, e.status);
    if (mount) {
      mount.innerHTML = `<p class="section-hint">${FETCH_FAIL_HINT}</p>`;
    }
    forceClearAllListLoading(true);
    showView("list");
  } finally {
    if (mount?.textContent?.includes("読み込み中")) {
      mount.innerHTML = '<p class="section-hint">書類状態を取得中です…</p>';
    }
  }
}

async function saveItems() {
  recalcLocal();
  const result = await patchItems({
    items: currentLines,
    notes: $("estimate-notes").value.trim(),
    shuseiDiscount: readShuseiDiscount(),
    shuseiDiscountMemo: $("shusei-discount-memo")?.value.trim() ?? "",
    priceRule: readSelectedPriceRule(),
  });
  scheduleDocumentsStatusRefresh();
  return result;
}

async function loadPending() {
  const code = customerCodeFromPath();
  const el = $("pending-list");
  const cacheKey = `pending:${code}`;
  try {
    const data = await api(`/pending-surveys?customerCode=${encodeURIComponent(code)}`, {
      label: "見積待ち",
    });
    cacheSet("estimate", cacheKey, data);
    renderPendingList(data.surveys || []);
  } catch (e) {
    const cached = cacheGet("estimate", cacheKey);
    if (cached?.surveys) {
      renderPendingList(cached.surveys);
    } else if (el) {
      el.innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
    }
  } finally {
    clearListLoading(
      el,
      '<div class="empty-icon">💰</div><p>見積待ちの案件はありません</p><p class="section-hint">データがありません</p>'
    );
  }
}

async function loadProjects() {
  const code = customerCodeFromPath();
  const el = $("project-list");
  const cacheKey = `projects:${code}`;
  const localProjects = listLocalDrafts(code)
    .filter((d) => d.mode !== "invoice" && !d.invoice)
    .map(localDraftAsProject);
  try {
    const data = await api(`/projects?customerCode=${encodeURIComponent(code)}`, { label: "見積案件" });
    cacheSet("estimate", cacheKey, data);
    renderProjectList([...localProjects, ...(data.projects || [])]);
  } catch (e) {
    const cached = cacheGet("estimate", cacheKey);
    const merged = cached?.projects
      ? [...localProjects, ...cached.projects]
      : localProjects;
    if (el) {
      if (merged.length) {
        renderProjectList(merged);
      } else {
        el.innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
      }
    }
  } finally {
    clearListLoading(
      el,
      '<div class="empty-icon">📋</div><p>まだ見積がありません</p><p class="section-hint">データがありません</p>'
    );
  }
}

function setListTab(tab) {
  const pending = tab === "pending";
  const invoices = tab === "invoices";
  const history = tab === "toms-history";
  $("tab-pending").classList.toggle("active", pending);
  $("tab-projects").classList.toggle("active", tab === "projects");
  $("tab-invoices")?.classList.toggle("active", invoices);
  $("tab-toms-history")?.classList.toggle("active", history);
  if (pending && selectionMode) {
    setSelectionMode(false, { reload: false });
  } else if (selectedIds.size) {
    selectedIds.clear();
    document.querySelectorAll("#project-list .list-card, #invoice-list .list-card").forEach((card) => {
      card.classList.remove("is-selected");
      const cb = card.querySelector(".bulk-check");
      if (cb) cb.checked = false;
    });
  }
  refreshListTabVisibility();
  if (invoices && authSession) loadInvoices();
  if (history) loadTomsHistoryList();
}

async function init() {
  try {
    window.__estimateBootOk = true;
  } catch {
    /* ignore */
  }
  scheduleBootstrapWatchdog();

  const initialTab = readInitialListTab();
  // 見積・請求はフッター統合 ID でハイライト
  const navAppId = "estimate_billing_v1";
  const navTitle = initialTab === "invoices" ? "請求" : "見積";

  practicalNav = initPracticalNav({
    appId: navAppId,
    appName: navTitle,
    theme: "blue",
    onBack: handlePracticalBack,
  });
  practicalNav.setToast(toast);
  showView("list");
  if (initialTab) setListTab(initialTab);
  else refreshListTabVisibility();

  $("btn-estimate-reload")?.addEventListener("click", () => {
    reloadEstimateData().catch((e) => {
      console.error(e);
      showStatusBanner("再読み込みに失敗しました。");
      forceClearAllListLoading(true);
    });
  });
  $("btn-estimate-login")?.addEventListener("click", () => {
    redirectToPortalLogin(customerCodeFromPath());
  });
  $("btn-manual-create-estimate")?.addEventListener("click", () => resetStandaloneForm("estimate"));
  $("btn-manual-create-invoice")?.addEventListener("click", () => resetStandaloneForm("invoice"));

  // ★重要: 非同期データ取得の前に UI ハンドラをすべてバインドする
  // （以前は await bootstrap の後だったため、読み込み中はタブ・ボタンが無反応だった）

  bindCustomerSuggest($("standalone-addressee"), $("standalone-customer-suggest"), (s) => {
    $("standalone-addressee").value = s.name;
    if ($("standalone-staff") && s.contactName) $("standalone-staff").value = s.contactName;
    if ($("standalone-work-location") && s.address) $("standalone-work-location").value = s.address;
  });
  bindCustomerSuggest($("hdr-addressee"), $("hdr-customer-suggest"), (s) => {
    $("hdr-addressee").value = s.name;
    if ($("hdr-staff") && s.contactName) $("hdr-staff").value = s.contactName;
    if ($("hdr-address") && s.address) $("hdr-address").value = s.address;
    if ($("hdr-phone") && s.phone) $("hdr-phone").value = s.phone;
  });

  $("tab-pending").addEventListener("click", () => setListTab("pending"));
  $("tab-projects").addEventListener("click", () => setListTab("projects"));
  $("tab-invoices")?.addEventListener("click", () => setListTab("invoices"));
  $("tab-toms-history")?.addEventListener("click", () => setListTab("toms-history"));

  $("btn-select-mode")?.addEventListener("click", () => {
    if (currentListTab() === "pending") {
      toast("見積・請求書一覧で選択できます");
      return;
    }
    setSelectionMode(!selectionMode);
  });
  $("btn-bulk-cancel")?.addEventListener("click", () => setSelectionMode(false));
  $("btn-bulk-delete")?.addEventListener("click", () => {
    if (!selectedIds.size) return;
    showDeleteConfirmDialog([...selectedIds]);
  });
  $("delete-dialog-cancel")?.addEventListener("click", hideDeleteConfirmDialog);
  $("delete-dialog-confirm")?.addEventListener("click", () => {
    deleteSelectedProjects().catch((e) => {
      bulkDeleteInProgress = false;
      syncBulkBar();
      toastError(e, e.status);
    });
  });
  $("delete-dialog-overlay")?.addEventListener("click", (ev) => {
    if (ev.target === $("delete-dialog-overlay")) hideDeleteConfirmDialog();
  });
  updateSelectToolbarVisibility();

  $("btn-new-standalone-estimate")?.addEventListener("click", () => resetStandaloneForm("estimate"));
  $("btn-new-standalone-invoice")?.addEventListener("click", () => resetStandaloneForm("invoice"));
  $("btn-standalone-submit")?.addEventListener("click", submitStandaloneForm);
  $("btn-standalone-cancel")?.addEventListener("click", hideStandaloneForm);

  $("btn-apply-line-template")?.addEventListener("click", async () => {
    const templateId = $("line-template-select")?.value;
    if (!templateId) {
      toast("テンプレートを選んでください");
      return;
    }
    try {
      const data = await api(`/line-templates/${encodeURIComponent(templateId)}/items`);
      const items = (data.items || []).map((it) => ({ ...it, id: undefined }));
      if (!items.length) {
        toast("テンプレートに明細がありません");
        return;
      }
      currentLines = items.map((it) => ({ ...newEmptyLine(), ...it }));
      renderLines(currentLines);
      toast("テンプレートを反映しました");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  bindLineImageParseUi();
  bindTomsBlastActionsUi();
  bindEstimateVoiceInputUi();

  $("btn-confirm-estimate")?.addEventListener("click", async () => {
    if (!pendingSurveyForEstimate) return;
    try {
      await createEstimateFromSurvey(pendingSurveyForEstimate);
    } catch (e) {
      toastError(e, e.status);
    }
  });
  $("btn-cancel-candidates")?.addEventListener("click", () => {
    pendingSurveyForEstimate = null;
    $("material-candidates-panel")?.classList.add("hidden");
    $("pending-list")?.classList.remove("hidden");
  });

  $("btn-save-header").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await saveHeader();
      toast("ヘッダーを保存しました");
      hidePdfPreview();
      showPdfQuickError("");
    } catch (e) {
      if (!isLocalProjectId(currentProjectId)) {
        savePendingOverlay(currentProjectId, {
          header: readHeaderForm(),
          items: currentLines,
          notes: $("estimate-notes")?.value?.trim() ?? "",
        });
        toast("オフライン保存しました。接続後に再保存してください");
      } else {
        toastError(e, e.status);
      }
    }
  });

  $("btn-add-line").addEventListener("click", () => {
    currentLines.push(newEmptyLine());
    renderLines(currentLines);
  });

  $("shusei-discount")?.addEventListener("input", () => recalcLocal());
  $("shusei-discount")?.addEventListener("change", () => recalcLocal());
  $("shusei-discount-memo")?.addEventListener("input", () => recalcLocal());

  $("price-rule-select")?.addEventListener("change", () => {
    const preset = priceRulePresets.find((p) => p.id === $("price-rule-select")?.value);
    syncMultiplierInputsFromRule(currentPriceRule, preset);
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, { shuseiDiscount: readShuseiDiscount() });
  });

  $("cost-multiplier")?.addEventListener("input", () => {
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, { shuseiDiscount: readShuseiDiscount() });
  });
  $("labor-multiplier")?.addEventListener("input", () => {
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, { shuseiDiscount: readShuseiDiscount() });
  });

  $("btn-recalc-price-rule")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await recalcWithPriceRule(false);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-recalc-master-pricing")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await recalcMasterPricing();
    } catch (e) {
      toastError(e, e.status);
    }
  });

  window.addEventListener("resize", () => updateLineListLayout());

  $("btn-save-items").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const result = await saveItems();
      toast("内訳を保存しました");
      updateTotalsFromEstimate(result.estimate);
      if (!isLocalProjectId(currentProjectId)) {
        const refreshed = await api(`/projects/${currentProjectId}`);
        renderPriceRulePanel({
          customerName: refreshed.customerName,
          priceRule: refreshed.priceRule,
          estimate: result.estimate,
        });
      }
      hidePdfPreview();
      showPdfQuickError("");
      $("detail-status").textContent = isLocalProjectId(currentProjectId) ? "オフライン保存" : "下書き";
      $("detail-status").className = "status-badge orange";
    } catch (e) {
      if (!isLocalProjectId(currentProjectId)) {
        recalcLocal();
        savePendingOverlay(currentProjectId, {
          header: readHeaderForm(),
          items: currentLines,
          notes: $("estimate-notes")?.value?.trim() ?? "",
          shuseiDiscount: readShuseiDiscount(),
          shuseiDiscountMemo: $("shusei-discount-memo")?.value?.trim() ?? "",
        });
        toast("オフライン保存しました。接続後に再保存してください");
      } else {
        toastError(e, e.status);
      }
    }
  });

  $("btn-completion-camera")?.addEventListener("click", () => $("completion-photo-input-camera")?.click());
  $("btn-completion-library")?.addEventListener("click", () => $("completion-photo-input-library")?.click());

  $("completion-photo-input-camera")?.addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = "";
    if (!files.length) return;
    try {
      await uploadCompletionPhotos(files);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("completion-photo-input-library")?.addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = "";
    if (!files.length) return;
    try {
      await uploadCompletionPhotos(files);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("completion-lightbox-close")?.addEventListener("click", closeCompletionLightbox);
  $("completion-photo-lightbox")?.addEventListener("click", (ev) => {
    if (ev.target === $("completion-photo-lightbox")) closeCompletionLightbox();
  });

  $("btn-pdf-estimate").addEventListener("click", () => openDocumentViewer("estimate"));
  $("btn-pdf-receipt")?.addEventListener("click", () =>
    openDocumentViewer("estimate", { receipt: true })
  );
  $("btn-pdf-invoice").addEventListener("click", () => openDocumentViewer("invoice"));
  $("btn-pdf-specification").addEventListener("click", () => openDocumentViewer("specification"));
  $("btn-pdf-completion").addEventListener("click", () => openDocumentViewer("completion"));

  $("btn-pdf-quick-generate")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    const kind = hasInvoice ? "invoice" : "estimate";
    try {
      if (isLocalProjectId(currentProjectId)) {
        showPdfQuickError("端末内保存のためPDFは作成できません。ログインしてサーバー保存後にお試しください。");
        return;
      }
      showPdfQuickError("");
      await openDocumentViewer(kind);
    } catch (e) {
      showPdfQuickError(e.message || "PDF作成に失敗しました");
    }
  });
  $("btn-pdf-quick-save")?.addEventListener("click", async () => {
    const kind = hasInvoice ? "invoice" : "estimate";
    try {
      if (isLocalProjectId(currentProjectId)) {
        showPdfQuickError("端末内保存のためPDFは保存できません。");
        return;
      }
      showPdfQuickError("");
      await saveDocumentFromList(kind);
    } catch (e) {
      showPdfQuickError(e.message || "PDF保存に失敗しました");
    }
  });

  $("btn-copy-bank")?.addEventListener("click", async () => {
    const text = $("invoice-bank-display")?.textContent?.trim();
    if (!text) {
      toast("振込先がありません");
      return;
    }
    const full = `${TOMS_COMPANY_NAME}\n${text}`;
    try {
      await navigator.clipboard.writeText(full);
      toast("振込先をコピーしました");
    } catch {
      toast(full);
    }
  });

  $("btn-create-completion-report")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const apiFetch = makeReportApiFetch();
      const okChecklist = await confirmChecklistBeforeReport(apiFetch, {
        projectSource: "business",
        projectId: currentProjectId,
      });
      if (!okChecklist) return;
      const okPhotos = await confirmCompletionPhotoSlotsBeforeReport(apiFetch, {
        projectId: currentProjectId,
      });
      if (!okPhotos) return;
      await api(`/projects/${currentProjectId}/completion-report/create`, { method: "POST", body: "{}" });
      openDocumentViewer("completion");
      toast("完了報告書を作成しました");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-duplicate-estimate").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積を複製しますか？\n内容はそのまま、見積番号だけ新しく発番します。")) return;
    try {
      const detail = await api(`/projects/${currentProjectId}/duplicate`, {
        method: "POST",
        body: "{}",
      });
      toast(`複製しました（${detail.estimate?.estimateNo || "新規"}）`);
      hidePdfPreview();
      $("hdr-estimate-no").value = detail.header?.estimateNo || detail.estimate?.estimateNo || "";
      $("detail-status").textContent = "下書き";
      $("detail-status").className = "status-badge orange";
      hasInvoice = false;
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-finalize").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積を確定しますか？\n印刷・提出用の見積書が作れます。")) return;
    try {
      await saveHeader().catch(() => ({}));
      await saveItems();
      const result = await api(`/projects/${currentProjectId}/finalize`, {
        method: "POST",
        body: JSON.stringify({ includePhotos: false }),
      });
      toast("見積を確定しました");
      openDocumentViewer("estimate");
      $("detail-status").textContent = "見積書の準備ができました";
      $("detail-status").className = "status-badge done";
      updateTotalsFromEstimate(result.estimate);
      await loadProjects();
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-invoice").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積をもとに請求書を作成しますか？")) return;
    try {
      await saveHeader().catch(() => ({}));
      await saveItems();
      await api(`/projects/${currentProjectId}/invoice`, { method: "POST", body: "{}" });
      hasInvoice = true;
      $("btn-invoice")?.classList.add("hidden");
      const refreshed = await api(`/projects/${currentProjectId}`);
      fillInvoiceHeaderForm(refreshed, refreshed.invoice);
      toast("請求書を作成しました（明細をコピーしました）");
      openDocumentViewer("invoice");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-toms").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const data = await api(`/projects/${currentProjectId}/toms-format`);
      lastTomsData = data;
      const preview = {
        header: data.header,
        total: data.total,
        subtotal: data.subtotal,
        tax: data.tax,
        lines: data.lines,
        notes: data.notes,
        company: data.company,
      };
      $("toms-preview").textContent = JSON.stringify(preview, null, 2);
      $("toms-section").classList.remove("hidden");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-toms-download").addEventListener("click", async () => {
    if (!lastTomsData) return;
    const text = JSON.stringify(lastTomsData, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  });

  // UI 操作可能にした後でデータ取得（失敗してもボタンは反応する）
  try {
    const auth = await resolveAuthSession();
    if (!auth.ok) {
      const msg =
        auth.reason === "no_token"
          ? "ログインが必要です。ログインするか、手動で新規作成できます。"
          : "セッションを確認できませんでした。再読み込みまたはログインしてください。";
      showStatusBanner(msg);
      forceClearAllListLoading(true);
      bootstrapWatchdog?.clear();
    } else {
      authSession = auth.session;
      await bootstrapEstimateData();
    }
  } catch (e) {
    console.error("[estimate-v1] auth/bootstrap failed", e);
    showStatusBanner(FETCH_FAIL_HINT, "error");
    forceClearAllListLoading(true);
    bootstrapWatchdog?.clear();
  } finally {
    // まだ「読み込み中」が残っていれば必ず解除（API 失敗時も操作可能な状態を維持）
    try {
      const stillLoading =
        $("pending-list")?.textContent?.includes("読み込み中") ||
        $("project-list")?.textContent?.includes("読み込み中") ||
        $("invoice-list")?.textContent?.includes("読み込み中");
      if (stillLoading) forceClearAllListLoading(true);
    } catch (clearErr) {
      console.error("[estimate-v1] init finally clear failed", clearErr);
    }
    setLoadStage("");
  }

  const deepLinkProject = readUrlProjectId();
  const masterDraftId = new URLSearchParams(window.location.search).get("masterDraftId");
  if (masterDraftId) {
    try {
      await importFromMasterDraft(masterDraftId);
    } catch (e) {
      toastError(e, e.status);
    }
  } else if (deepLinkProject) {
    await openDetail(deepLinkProject).catch((e) => {
      console.error(e);
      toastError(e, e.status);
      forceClearAllListLoading(true);
    });
  }
}

init().catch((e) => {
  console.error(e);
  forceClearAllListLoading(true);
  showStatusBanner(FETCH_FAIL_HINT, "error");
  const pending = $("pending-list");
  if (pending?.textContent?.includes("読み込み中")) {
    pending.innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
});
