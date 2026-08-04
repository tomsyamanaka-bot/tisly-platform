/**
 * 見積一覧 — 見積書準備済み / 請求書作成済み案件の
 * 見積書・請求書 PDF を QNAP 実機へ WebDAV 保存（v1）
 *
 * 保存経路: スマホ → VPS（https://tisly.jp/api/...）→ QNAP WebDAV
 * ブラウザから QNAP への直接通信は行わない（CORS / Mixed Content 回避）
 *
 * 保存先: TiSLY_Storage/Invoices_Estimates/YYYY-MM/
 * モックミラーへのフォールバックは行わない（実機通信のみ）
 * 接続解決順: .env(QNAP_WEBDAV_*) → ストレージ設定 UI → .env(QNAP_HOST / QNAP_LOCAL_*)
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
} from "./mothership-paths-v1.js";
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
  documentNasSaveSuccessMessage,
  formatVpsToQnapProxyError,
  resolveDocumentNasLocalHost,
  resolveDocumentNasLocalPort,
} from "./qnap-nas-hosts-v1.js";
import { classifyQnapNetworkError } from "./qnap-network-diagnose-v1.js";
import {
  QNAP_DEFAULT_BASIC_USER,
  resolveQnapBasicAuthCredentials,
} from "./qnap-basic-auth-v1.js";

const CONNECT_RETRY_COUNT = 2;
const CONNECT_RETRY_DELAY_MS = 800;

export type EstimateInvoiceQnapSaveFileV1 = {
  kind: "estimate" | "invoice";
  localPath: string;
  remotePath: string;
  displayPath: string;
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
  /** 常に VPS プロキシ（ブラウザ直通信なし） */
  proxyRoute?: "vps";
  connectLatencyMs?: number | null;
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
    const count = await client.uploadLocalFiles([
      { localPath: localAbs, remotePath: remoteRel },
    ]);
    if (count < 1) {
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

/**
 * 見積書準備済み（および請求書があれば請求書も）を
 * VPS から QNAP 実機へ WebDAV 保存する。モックミラーは使わない。
 */
export async function saveEstimateInvoicePdfsToQnapV1(
  projectId: string
): Promise<EstimateInvoiceQnapSaveResultV1> {
  const project = getBusinessProject(projectId);
  if (!project) {
    return {
      ok: false,
      mock: false,
      projectId,
      message: "案件が見つかりません",
      files: [],
      error: "project not found",
      errorCode: "PROJECT_NOT_FOUND",
      proxyRoute: "vps",
    };
  }

  // 見積も請求もない案件は対象外
  if (!project.estimateId && !project.invoiceId) {
    return {
      ok: false,
      mock: false,
      projectId,
      message: "見積書・請求書が未作成のため保存できません",
      files: [],
      error: "no documents",
      errorCode: "NO_DOCUMENTS",
      proxyRoute: "vps",
    };
  }

  const settings = getStorageSettingsV1();
  const cfg = resolveRealQnapWebDavForListSave(settings);
  if (!cfg) {
    return {
      ok: false,
      mock: false,
      projectId,
      message: formatVpsToQnapProxyError(
        DOCUMENT_NAS_HOST,
        DOCUMENT_NAS_DEFAULT_PORT,
        "NOT_CONFIGURED"
      ),
      files: [],
      error: "qnap not configured",
      errorCode: "NOT_CONFIGURED",
      proxyRoute: "vps",
      host: DOCUMENT_NAS_HOST,
      port: DOCUMENT_NAS_DEFAULT_PORT,
    };
  }

  const probe = await probeVpsToQnapConnection(cfg);
  if (!probe.ok) {
    return {
      ok: false,
      mock: false,
      projectId,
      message: probe.message,
      files: [],
      error: probe.message,
      errorCode: probe.errorCode,
      host: probe.host,
      port: probe.port,
      proxyRoute: "vps",
      connectLatencyMs: probe.latencyMs,
    };
  }

  // 探索で応答したポートを次回優先・PUT でも使用
  const workingCfg: QnapUploadConfig = {
    ...cfg,
    webdavUrl: probe.webdavUrl || cfg.webdavUrl,
  };

  const kinds: Array<"estimate" | "invoice"> = [];
  if (project.estimateId) kinds.push("estimate");
  if (project.invoiceId) kinds.push("invoice");

  const files: EstimateInvoiceQnapSaveFileV1[] = [];
  let lastUploadCode: string | null = null;

  for (const kind of kinds) {
    const localAbs = await ensureKindPdf(projectId, kind);
    if (!localAbs) {
      files.push({
        kind,
        localPath: "",
        remotePath: "",
        displayPath: "",
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
    const uploaded = await uploadOneReal(workingCfg, abs, remoteRel);
    if (!uploaded.ok && uploaded.errorCode) {
      lastUploadCode = uploaded.errorCode;
    }
    files.push({
      kind,
      localPath: localAbs,
      remotePath: remoteRel,
      displayPath,
      mock: false,
      ok: uploaded.ok,
      error: uploaded.error
        ? formatVpsToQnapProxyError(
            probe.host,
            probe.port,
            uploaded.errorCode || "UPLOAD_FAILED",
            uploaded.error
          )
        : undefined,
    });
  }

  const allOk = files.length > 0 && files.every((f) => f.ok);
  if (allOk) {
    return {
      ok: true,
      mock: false,
      projectId,
      message: documentNasSaveSuccessMessage(
        probe.host,
        probe.port,
        files.find((f) => f.ok)?.remotePath || undefined
      ),
      files,
      host: probe.host,
      port: probe.port,
      folderPath:
        files.find((f) => f.ok)?.remotePath ||
        "TiSLY_Storage/Invoices_Estimates",
      proxyRoute: "vps",
      connectLatencyMs: probe.latencyMs,
      errorCode: null,
    };
  }

  const firstErr =
    files.find((f) => !f.ok)?.error ||
    formatVpsToQnapProxyError(
      probe.host,
      probe.port,
      lastUploadCode || "UPLOAD_FAILED"
    );
  return {
    ok: false,
    mock: false,
    projectId,
    message: firstErr,
    files,
    error: firstErr,
    errorCode: lastUploadCode || "UPLOAD_FAILED",
    host: probe.host,
    port: probe.port,
    proxyRoute: "vps",
    connectLatencyMs: probe.latencyMs,
  };
}
