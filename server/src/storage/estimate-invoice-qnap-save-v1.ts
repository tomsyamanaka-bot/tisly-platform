/**
 * 見積一覧 — 見積書準備済み / 請求書作成済み案件の
 * 見積書・請求書 PDF を QNAP へ保存（v1 + 多重フォールバック）
 *
 * 保存経路: スマホ → VPS（https://tisly.jp/api/...）→ QNAP
 * ブラウザから QNAP への直接通信は行わない（CORS / Mixed Content 回避）
 *
 * フォールバック順:
 * 1. http://{tailscale}:5005 WebDAV
 * 2. https://{tailscale}:5006 WebDAV
 * 3. File Station utilRequest.cgi (:8080)
 * 4. http://{lan}:8080 WebDAV
 * 5. VPS ローカル一時保持 → Worker 自動同期
 *
 * 保存先: /TiSLY/Invoices_Estimates/YYYY-MM/（403/404 時 /Public/TiSLY/...）
 */
import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
import type { QnapUploadConfig } from "../business/services/qnapBusinessArchive.js";
import {
  getBusinessProject,
  getEstimate,
  getInvoice,
} from "../business/business-store.js";
import {
  regenerateProjectPdfV1,
  resolveProjectPdfFile,
  type ProjectPdfKind,
} from "../projects/project-pdf-store.js";
import {
  buildInvoicesEstimatesBackupDisplayPathV1,
  buildInvoicesEstimatesBackupRelativePathV1,
  buildInvoicesEstimatesAbsolutePathV1,
} from "./mothership-paths-v1.js";
import { appendQnapSaveDebugLogV1 } from "./estimate-invoice-qnap-debug-log-v1.js";
import {
  markJobFromSaveResultV1,
  updateEstimateInvoiceQnapJobV1,
} from "./estimate-invoice-qnap-job-store-v1.js";
import {
  getStorageSettingsV1,
  type StorageSettingsV1,
} from "./storage-settings-store.js";
import {
  buildWebDavUrl,
  settingsToWebDavConfig,
} from "./qnap-storage-service.js";
import { getQnapWebDavEnvConfig } from "./qnap-storage-v1-config.js";
import { config } from "../config.js";
import {
  DOCUMENT_NAS_DEFAULT_PORT,
  DOCUMENT_NAS_HOST,
  documentNasConnectSuccessMessage,
  documentNasPdfSavePendingMessage,
  documentNasPdfSaveSuccessMessage,
  formatVpsToQnapProxyError,
  resolveDocumentNasLocalHost,
  resolveDocumentNasLocalPort,
} from "./qnap-nas-hosts-v1.js";
import { classifyQnapNetworkError } from "./qnap-network-diagnose-v1.js";
import {
  QNAP_DEFAULT_BASIC_USER,
  resolveQnapBasicAuthCredentials,
} from "./qnap-basic-auth-v1.js";
import {
  resolveDocumentNasTailscaleHost,
  uploadEstimateInvoiceWithFallbackV1,
  type QnapFallbackRouteKindV1,
} from "./estimate-invoice-qnap-fallback-routes-v1.js";
import { enqueueEstimateInvoiceQnapPendingV1 } from "./estimate-invoice-qnap-pending-store-v1.js";
import { markQnapInfraGreenV1 } from "../infrastructure/qnap-infra-health-v1.js";

const CONNECT_RETRY_COUNT = 2;
const CONNECT_RETRY_DELAY_MS = 800;

export type EstimateInvoiceQnapSaveFileV1 = {
  kind: "estimate" | "invoice";
  localPath: string;
  remotePath: string;
  displayPath: string;
  /** QNAP 上の絶対パス（例: /TiSLY/Invoices_Estimates/2026-08/見積書.pdf） */
  absolutePath?: string;
  mock: boolean;
  ok: boolean;
  error?: string;
};

export type EstimateInvoiceQnapSaveResultV1 = {
  ok: boolean;
  mock: boolean;
  projectId: string;
  message: string;
  files: EstimateInvoiceQnapSaveFileV1[];
  error?: string;
  errorCode?: string | null;
  host?: string;
  port?: number;
  folderPath?: string;
  /** 実際に保存された絶対パス一覧 */
  savedAbsolutePaths?: string[];
  /** 通信トレース（MKCOL / PUT 等） */
  debugSteps?: Array<{
    at: string;
    method: string;
    urlOrPath: string;
    status?: number | null;
    ok: boolean;
    detail?: string;
  }>;
  /** 常に VPS プロキシ（ブラウザ直通信なし） */
  proxyRoute?: "vps";
  connectLatencyMs?: number | null;
  /** QNAP リモート未到達でローカル一時保持 */
  pendingSync?: boolean;
  /** 成功したフォールバックルート */
  fallbackRoute?: QnapFallbackRouteKindV1 | null;
  jobId?: string | null;
};

function resolveLocalAbsolute(localPath: string): string | null {
  if (!localPath?.trim()) return null;
  if (path.isAbsolute(localPath) && fs.existsSync(localPath)) return localPath;
  const full = path.join(process.cwd(), localPath.replace(/^\//, ""));
  return fs.existsSync(full) ? full : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseHostPortFromWebDavUrl(webdavUrl: string): {
  host: string;
  port: number;
} {
  try {
    const u = new URL(webdavUrl);
    const host = u.hostname || DOCUMENT_NAS_HOST;
    const port =
      Number(u.port) > 0
        ? Number(u.port)
        : u.protocol === "https:"
          ? 443
          : DOCUMENT_NAS_DEFAULT_PORT;
    return { host, port };
  } catch {
    return {
      host: DOCUMENT_NAS_HOST,
      port: DOCUMENT_NAS_DEFAULT_PORT,
    };
  }
}

/**
 * 実機 WebDAV 設定を解決する。
 * 接続解決順: .env(QNAP_WEBDAV_*) → ストレージ設定 UI → .env(QNAP_HOST / QNAP_LOCAL_*)
 * Basic 認証: QNAP_USER / QNAP_PASSWORD → ストレージ設定 → 既定ユーザー tomsadmin
 * 不足時は null（モックへは落とさない）。
 */
export function resolveRealQnapWebDavForListSave(
  settings?: StorageSettingsV1
): QnapUploadConfig | null {
  const current = settings ?? getStorageSettingsV1();
  const q = current.qnap;
  const auth = resolveQnapBasicAuthCredentials({
    settingsUsername: q.username,
    settingsPassword: q.password,
    allowDefaultUser: true,
  });

  const envWebDav = getQnapWebDavEnvConfig();
  if (envWebDav.webdavUrl.trim()) {
    // URL がある場合は常に Basic 認証を解決して付与（未設定時は tomsadmin）
    return {
      mode: "real",
      webdavUrl: envWebDav.webdavUrl,
      username: auth.username || envWebDav.username || QNAP_DEFAULT_BASIC_USER,
      password: auth.password || envWebDav.password || "",
      basePath: envWebDav.baseDir || "/",
    };
  }

  if (q.host.trim()) {
    const cfg = settingsToWebDavConfig(current);
    return {
      ...cfg,
      username: auth.username || QNAP_DEFAULT_BASIC_USER,
      password: auth.password,
    };
  }

  const host = resolveDocumentNasLocalHost(
    config.qnap.host || process.env.QNAP_HOST || process.env.QNAP_LOCAL_HOST || ""
  );
  if (host) {
    const port = resolveDocumentNasLocalPort(
      Number(process.env.QNAP_PORT || process.env.QNAP_LOCAL_PORT || q.port || 0) ||
        null
    );
    const share =
      (config.qnap.share || process.env.QNAP_SHARE || q.shareName || "TiSLY").trim() ||
      "TiSLY";
    return {
      mode: "real",
      webdavUrl: buildWebDavUrl(host, port, share),
      username: auth.username || QNAP_DEFAULT_BASIC_USER,
      password: auth.password,
      basePath: "/",
    };
  }

  return null;
}

async function ensureKindPdf(
  projectId: string,
  kind: ProjectPdfKind
): Promise<string | null> {
  const existing = resolveProjectPdfFile(projectId, kind);
  if (existing && fs.existsSync(existing) && fs.statSync(existing).size > 0) {
    return existing;
  }
  try {
    await regenerateProjectPdfV1(projectId, kind);
  } catch (e) {
    console.warn(
      `[QNAP save] regenerate ${kind} failed:`,
      e instanceof Error ? e.message : e
    );
  }
  return resolveProjectPdfFile(projectId, kind);
}

/**
 * VPS→QNAP 接続テスト（タイムアウト／拒否を現場向け文言へ）
 * スマートポート探索で応答した URL を webdavUrl として返す。
 */
export async function probeVpsToQnapConnection(
  cfg: QnapUploadConfig
): Promise<{
  ok: boolean;
  host: string;
  port: number;
  webdavUrl: string;
  latencyMs: number;
  errorCode: string | null;
  message: string;
}> {
  const started = Date.now();
  let lastMsg = "";
  let lastCode: string | null = null;
  let lastHostPort = parseHostPortFromWebDavUrl(cfg.webdavUrl);
  let lastWebDavUrl = cfg.webdavUrl;

  for (let attempt = 1; attempt <= CONNECT_RETRY_COUNT; attempt += 1) {
    try {
      const client = new QnapWebDavClient({ ...cfg, mode: "real" });
      const result = await client.testConnection();
      const latencyMs = Date.now() - started;
      if (result.ok) {
        const effectiveUrl =
          result.webdavUrl || client.getEffectiveWebDavUrl() || cfg.webdavUrl;
        const parsed = parseHostPortFromWebDavUrl(effectiveUrl);
        return {
          ok: true,
          host: parsed.host,
          port: parsed.port,
          webdavUrl: effectiveUrl,
          latencyMs,
          errorCode: null,
          message: documentNasConnectSuccessMessage(parsed.port),
        };
      }
      lastMsg = result.message;
      lastWebDavUrl = client.getEffectiveWebDavUrl() || cfg.webdavUrl;
      lastHostPort = parseHostPortFromWebDavUrl(lastWebDavUrl);
      const classified = classifyQnapNetworkError(result.message, null);
      lastCode = classified.errorCode;
      console.warn(
        `[QNAP VPS proxy] connect probe fail attempt=${attempt}/${CONNECT_RETRY_COUNT} host=${lastHostPort.host}:${lastHostPort.port} code=${lastCode} msg=${lastMsg}`
      );
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e);
      const classified = classifyQnapNetworkError(lastMsg, null);
      lastCode = classified.errorCode;
      console.warn(
        `[QNAP VPS proxy] connect probe exception attempt=${attempt} host=${lastHostPort.host}:${lastHostPort.port}`,
        lastMsg
      );
    }
    if (attempt < CONNECT_RETRY_COUNT) {
      await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }

  const classified = classifyQnapNetworkError(lastMsg, null);
  const errorCode = lastCode || classified.errorCode;
  // 全ポート拒否時はコントロールパネル案内メッセージを優先
  const allPortsRefused =
    errorCode === "ECONNREFUSED" ||
    /ECONNREFUSED/i.test(lastMsg) ||
    /tried:/i.test(lastMsg);
  return {
    ok: false,
    host: lastHostPort.host,
    port: lastHostPort.port,
    webdavUrl: lastWebDavUrl,
    latencyMs: Date.now() - started,
    errorCode: allPortsRefused ? "ECONNREFUSED" : errorCode,
    message: formatVpsToQnapProxyError(
      lastHostPort.host,
      lastHostPort.port,
      allPortsRefused ? "ECONNREFUSED" : errorCode || classified.errorCode,
      classified.errorReason || lastMsg
    ),
  };
}

async function uploadOneReal(
  cfg: QnapUploadConfig,
  localAbs: string,
  remoteRel: string
): Promise<{ ok: boolean; mock: boolean; error?: string; errorCode?: string }> {
  if (!fs.existsSync(localAbs)) {
    return {
      ok: false,
      mock: false,
      error: `ローカル PDF が見つかりません: ${localAbs}`,
      errorCode: "LOCAL_PDF_MISSING",
    };
  }
  try {
    const client = new QnapWebDavClient({ ...cfg, mode: "real" });
    const uploaded = await client.uploadLocalFiles([
      { localPath: localAbs, remotePath: remoteRel },
    ]);
    if (uploaded.count < 1) {
      return {
        ok: false,
        mock: false,
        error: `WebDAV PUT が 0 件でした: ${remoteRel}`,
        errorCode: "PUT_EMPTY",
      };
    }
    console.log(`[QNAP REAL] Invoices_Estimates uploaded — ${remoteRel}`);
    return { ok: true, mock: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const classified = classifyQnapNetworkError(msg, null);
    console.error(`[QNAP REAL] WebDAV upload failed: ${remoteRel}`, msg);
    return {
      ok: false,
      mock: false,
      error: msg,
      errorCode: classified.errorCode,
    };
  }
}

function buildRemoteFileName(
  projectId: string,
  kind: "estimate" | "invoice",
  localAbs: string
): string {
  const project = getBusinessProject(projectId);
  const base = path.basename(localAbs) || `${kind}.pdf`;
  if (kind === "estimate") {
    const est = project?.estimateId
      ? getEstimate(project.estimateId)
      : null;
    const no = est?.estimateNo || project?.projectNo || projectId.slice(0, 8);
    return base.toLowerCase().endsWith(".pdf")
      ? base
      : `estimate-${no}.pdf`;
  }
  const inv = project?.invoiceId
    ? getInvoice(project.invoiceId)
    : null;
  const no = inv?.invoiceNo || project?.projectNo || projectId.slice(0, 8);
  return base.toLowerCase().endsWith(".pdf")
    ? base
    : `invoice-${no}.pdf`;
}

function resolveAuthForFallback(cfg: QnapUploadConfig | null): {
  username: string;
  password: string;
} {
  if (cfg) {
    return {
      username: cfg.username || QNAP_DEFAULT_BASIC_USER,
      password: cfg.password || "",
    };
  }
  const auth = resolveQnapBasicAuthCredentials({ allowDefaultUser: true });
  return {
    username: auth.username || QNAP_DEFAULT_BASIC_USER,
    password: auth.password || "",
  };
}

/**
 * 見積書準備済み（および請求書があれば請求書も）を
 * VPS から QNAP へ多重フォールバック保存する。
 * 全滅時もローカル PDF を保持し pendingSync で 200 相当の成功扱い。
 * @param options.jobId 非同期ジョブ ID（ポーリング用）
 */
export async function saveEstimateInvoicePdfsToQnapV1(
  projectId: string,
  options?: { jobId?: string | null }
): Promise<EstimateInvoiceQnapSaveResultV1> {
  const jobId = options?.jobId || null;
  if (jobId) {
    updateEstimateInvoiceQnapJobV1(jobId, {
      status: "running",
      message: "QNAPへ保存中…",
    });
  }

  const started = Date.now();
  const project = getBusinessProject(projectId);
  if (!project) {
    const fail: EstimateInvoiceQnapSaveResultV1 = {
      ok: false,
      mock: false,
      projectId,
      message: "案件が見つかりません",
      files: [],
      error: "project not found",
      errorCode: "PROJECT_NOT_FOUND",
      proxyRoute: "vps",
      pendingSync: false,
      jobId,
      savedAbsolutePaths: [],
    };
    if (jobId) markJobFromSaveResultV1(jobId, fail);
    return fail;
  }

  // 見積も請求もない案件は対象外
  if (!project.estimateId && !project.invoiceId) {
    const fail: EstimateInvoiceQnapSaveResultV1 = {
      ok: false,
      mock: false,
      projectId,
      message: "見積書・請求書が未作成のため保存できません",
      files: [],
      error: "no documents",
      errorCode: "NO_DOCUMENTS",
      proxyRoute: "vps",
      pendingSync: false,
      jobId,
      savedAbsolutePaths: [],
    };
    if (jobId) markJobFromSaveResultV1(jobId, fail);
    return fail;
  }

  const settings = getStorageSettingsV1();
  const cfg = resolveRealQnapWebDavForListSave(settings);
  const auth = resolveAuthForFallback(cfg);

  const kinds: Array<"estimate" | "invoice"> = [];
  if (project.estimateId) kinds.push("estimate");
  if (project.invoiceId) kinds.push("invoice");

  const prepared: EstimateInvoiceQnapSaveFileV1[] = [];
  for (const kind of kinds) {
    const localAbs = await ensureKindPdf(projectId, kind);
    if (!localAbs) {
      prepared.push({
        kind,
        localPath: "",
        remotePath: "",
        displayPath: "",
        absolutePath: "",
        mock: false,
        ok: false,
        error: `${kind} PDF を生成できませんでした`,
      });
      continue;
    }
    const abs = resolveLocalAbsolute(localAbs) ?? localAbs;
    const fileName = buildRemoteFileName(projectId, kind, abs);
    const remoteRel = buildInvoicesEstimatesBackupRelativePathV1(fileName);
    const displayPath = buildInvoicesEstimatesBackupDisplayPathV1(fileName);
    const absolutePath = buildInvoicesEstimatesAbsolutePathV1(fileName);
    prepared.push({
      kind,
      localPath: abs,
      remotePath: remoteRel,
      displayPath,
      absolutePath,
      mock: false,
      ok: true,
    });
  }

  const uploadable = prepared.filter((f) => f.ok && f.localPath);
  if (uploadable.length === 0) {
    const fail: EstimateInvoiceQnapSaveResultV1 = {
      ok: false,
      mock: false,
      projectId,
      message: "見積書・請求書 PDF を用意できませんでした",
      files: prepared,
      error: "pdf generation failed",
      errorCode: "PDF_GENERATION_FAILED",
      proxyRoute: "vps",
      pendingSync: false,
      connectLatencyMs: Date.now() - started,
      jobId,
      savedAbsolutePaths: [],
    };
    if (jobId) markJobFromSaveResultV1(jobId, fail);
    appendQnapSaveDebugLogV1({
      projectId,
      jobId,
      ok: false,
      message: fail.message,
      savedAbsolutePaths: [],
      steps: [],
      error: fail.error,
    });
    return fail;
  }

  const tailscaleHost = resolveDocumentNasTailscaleHost(
    cfg ? parseHostPortFromWebDavUrl(cfg.webdavUrl).host : null
  );
  const lanHost = resolveDocumentNasLocalHost(
    settings.qnap.host || process.env.QNAP_LOCAL_HOST || DOCUMENT_NAS_HOST
  );
  const shareName =
    (cfg &&
      (() => {
        try {
          const p = new URL(cfg.webdavUrl).pathname.replace(/^\/+|\/+$/g, "");
          return p.split("/")[0] || "TiSLY";
        } catch {
          return "TiSLY";
        }
      })()) ||
    settings.qnap.shareName ||
    "TiSLY";

  const fallback = await uploadEstimateInvoiceWithFallbackV1({
    username: auth.username,
    password: auth.password,
    files: uploadable.map((f) => ({
      kind: f.kind,
      localPath: f.localPath,
      remotePath: f.remotePath,
      displayPath: f.displayPath,
      absolutePath: f.absolutePath,
      fileName: path.basename(f.localPath),
    })),
    tailscaleHost,
    lanHost,
    shareName,
  });

  const files: EstimateInvoiceQnapSaveFileV1[] = prepared.map((f) => {
    if (!f.ok) return f;
    const match = fallback.files.find((x) => x.kind === f.kind);
    return {
      ...f,
      ok: match ? match.ok : fallback.ok,
      error: match?.error,
      remotePath: match?.remotePath || f.remotePath,
      displayPath: match?.absolutePath || match?.displayPath || f.displayPath,
      absolutePath: match?.absolutePath || f.absolutePath,
    };
  });

  const savedAbsolutePaths =
    fallback.savedAbsolutePaths?.length > 0
      ? fallback.savedAbsolutePaths
      : files.filter((f) => f.ok && f.absolutePath).map((f) => f.absolutePath!);

  if (fallback.remoteOk) {
    markQnapInfraGreenV1({
      host: fallback.host,
      port: fallback.port,
      detail: "OK",
      method: "save",
    });
    const successMsg =
      savedAbsolutePaths.length > 0
        ? `${documentNasPdfSaveSuccessMessage()} → ${savedAbsolutePaths.join(" / ")}`
        : documentNasPdfSaveSuccessMessage();
    const result: EstimateInvoiceQnapSaveResultV1 = {
      ok: true,
      mock: false,
      projectId,
      message: successMsg,
      files,
      host: fallback.host,
      port: fallback.port,
      folderPath:
        savedAbsolutePaths[0] ||
        files.find((f) => f.ok)?.absolutePath ||
        "/TiSLY/Invoices_Estimates",
      savedAbsolutePaths,
      debugSteps: fallback.steps,
      proxyRoute: "vps",
      connectLatencyMs: Date.now() - started,
      errorCode: null,
      pendingSync: false,
      fallbackRoute: fallback.route,
      jobId,
    };
    appendQnapSaveDebugLogV1({
      projectId,
      jobId,
      ok: true,
      pendingSync: false,
      route: fallback.route,
      host: fallback.host,
      port: fallback.port,
      savedAbsolutePaths,
      message: successMsg,
      steps: fallback.steps.map((s) => ({
        at: s.at,
        method: s.method,
        urlOrPath: s.urlOrPath,
        status: s.status ?? null,
        ok: s.ok,
        detail: s.detail,
      })),
    });
    if (jobId) markJobFromSaveResultV1(jobId, result);
    return result;
  }

  // 全滅 → ローカル一時保持（ユーザー体験を落とさない）
  enqueueEstimateInvoiceQnapPendingV1({
    projectId,
    files: uploadable.map((f) => ({
      kind: f.kind,
      localPath: f.localPath,
      remotePath: f.remotePath,
      displayPath: f.displayPath,
    })),
    lastError:
      fallback.attempts
        .filter((a) => !a.ok)
        .map((a) => `${a.route}: ${a.error || "fail"}`)
        .join("; ") || "all remote routes failed",
  });

  const pendingMsg = documentNasPdfSavePendingMessage();
  const result: EstimateInvoiceQnapSaveResultV1 = {
    ok: true,
    mock: false,
    projectId,
    message: pendingMsg,
    files: files.map((f) =>
      f.localPath ? { ...f, ok: true, error: undefined } : f
    ),
    host: fallback.host,
    port: fallback.port,
    folderPath:
      files.find((f) => f.localPath)?.absolutePath ||
      "/TiSLY/Invoices_Estimates",
    savedAbsolutePaths: [],
    debugSteps: fallback.steps,
    proxyRoute: "vps",
    connectLatencyMs: Date.now() - started,
    errorCode: fallback.errorCode || "PENDING_SYNC",
    pendingSync: true,
    fallbackRoute: "local_pending",
    jobId,
  };
  appendQnapSaveDebugLogV1({
    projectId,
    jobId,
    ok: true,
    pendingSync: true,
    route: "local_pending",
    host: fallback.host,
    port: fallback.port,
    savedAbsolutePaths: [],
    message: pendingMsg,
    steps: fallback.steps.map((s) => ({
      at: s.at,
      method: s.method,
      urlOrPath: s.urlOrPath,
      status: s.status ?? null,
      ok: s.ok,
      detail: s.detail,
    })),
    error:
      fallback.attempts
        .filter((a) => !a.ok)
        .map((a) => `${a.route}: ${a.error || "fail"}`)
        .join("; ") || null,
  });
  if (jobId) markJobFromSaveResultV1(jobId, result);
  return result;
}

/** Worker 再送用 — 既に用意済みのローカル PDF を多重フォールバックで送信 */
export async function retryPendingEstimateInvoiceUploadV1(input: {
  projectId: string;
  files: Array<{
    kind: "estimate" | "invoice";
    localPath: string;
    remotePath: string;
    displayPath: string;
  }>;
}): Promise<{ ok: boolean; remoteOk: boolean; message: string; error?: string }> {
  const settings = getStorageSettingsV1();
  const cfg = resolveRealQnapWebDavForListSave(settings);
  const auth = resolveAuthForFallback(cfg);
  const existing = input.files.filter(
    (f) => f.localPath && fs.existsSync(f.localPath)
  );
  if (existing.length === 0) {
    return {
      ok: false,
      remoteOk: false,
      message: "ローカル PDF が消失しています",
      error: "LOCAL_PDF_MISSING",
    };
  }
  const fallback = await uploadEstimateInvoiceWithFallbackV1({
    username: auth.username,
    password: auth.password,
    files: existing,
    tailscaleHost: cfg
      ? parseHostPortFromWebDavUrl(cfg.webdavUrl).host
      : null,
    lanHost: resolveDocumentNasLocalHost(
      settings.qnap.host || process.env.QNAP_LOCAL_HOST || DOCUMENT_NAS_HOST
    ),
    skipLocalPending: true,
  });
  if (fallback.remoteOk) {
    markQnapInfraGreenV1({
      host: fallback.host,
      port: fallback.port,
      detail: "OK",
      method: "save",
    });
    return {
      ok: true,
      remoteOk: true,
      message: documentNasPdfSaveSuccessMessage(),
    };
  }
  // pending ルートは再 enqueue しない（呼び出し側が attempts を管理）
  return {
    ok: false,
    remoteOk: false,
    message: documentNasPdfSavePendingMessage(),
    error:
      fallback.attempts
        .filter((a) => a.route !== "local_pending" && !a.ok)
        .map((a) => a.error)
        .filter(Boolean)
        .join("; ") || "remote still unreachable",
  };
}

export { uploadOneReal };
