/**
 * 見積一覧 — 見積書準備済み / 請求書作成済み案件の
 * 見積書・請求書 PDF を QNAP 実機へ WebDAV 保存（v1）
 *
 * 保存先: TiSLY_Storage/Invoices_Estimates/YYYY-MM/
 * モックミラーへのフォールバックは行わない（実機通信のみ）
 * 接続解決順: .env(QNAP_WEBDAV_*) → ストレージ設定 UI → .env(QNAP_HOST)
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
  DOCUMENT_NAS_HOST,
  documentNasSaveSuccessMessage,
  resolveDocumentNasLocalHost,
  resolveDocumentNasLocalPort,
} from "./qnap-nas-hosts-v1.js";

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
};

function resolveLocalAbsolute(localPath: string): string | null {
  if (!localPath?.trim()) return null;
  if (path.isAbsolute(localPath) && fs.existsSync(localPath)) return localPath;
  const full = path.join(process.cwd(), localPath.replace(/^\//, ""));
  return fs.existsSync(full) ? full : null;
}

/**
 * 実機 WebDAV 設定を解決する。
 * 本番 VPS の .env(QNAP_WEBDAV_*) を最優先（ストレージ UI の古い LAN IP より優先）。
 * 不足時は null（モックへは落とさない）。
 */
export function resolveRealQnapWebDavForListSave(
  settings?: StorageSettingsV1
): QnapUploadConfig | null {
  const envWebDav = getQnapWebDavEnvConfig();
  if (envWebDav.configured) {
    return {
      mode: "real",
      webdavUrl: envWebDav.webdavUrl,
      username: envWebDav.username,
      password: envWebDav.password,
      basePath: envWebDav.baseDir || "/",
    };
  }

  const current = settings ?? getStorageSettingsV1();
  const q = current.qnap;
  if (q.host.trim() && q.username.trim() && q.password) {
    return settingsToWebDavConfig(current);
  }

  const host = resolveDocumentNasLocalHost(
    config.qnap.host || process.env.QNAP_HOST || ""
  );
  const username = (
    config.qnap.username ||
    process.env.QNAP_USERNAME ||
    process.env.QNAP_WEBDAV_USER ||
    ""
  ).trim();
  const password =
    config.qnap.password ||
    process.env.QNAP_PASSWORD ||
    process.env.QNAP_WEBDAV_PASSWORD ||
    "";
  if (host && username && password) {
    const port = resolveDocumentNasLocalPort(
      Number(process.env.QNAP_PORT || q.port || 0) || null
    );
    const share =
      (config.qnap.share || process.env.QNAP_SHARE || q.shareName || "TiSLY").trim() ||
      "TiSLY";
    return {
      mode: "real",
      webdavUrl: buildWebDavUrl(host, port, share),
      username,
      password,
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

async function uploadOneReal(
  cfg: QnapUploadConfig,
  localAbs: string,
  remoteRel: string
): Promise<{ ok: boolean; mock: boolean; error?: string }> {
  if (!fs.existsSync(localAbs)) {
    return {
      ok: false,
      mock: false,
      error: `ローカル PDF が見つかりません: ${localAbs}`,
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
      };
    }
    console.log(`[QNAP REAL] Invoices_Estimates uploaded — ${remoteRel}`);
    return { ok: true, mock: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[QNAP REAL] WebDAV upload failed: ${remoteRel}`, msg);
    return { ok: false, mock: false, error: msg };
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
 * QNAP 実機へ WebDAV 保存する。モックミラーは使わない。
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
    };
  }

  const settings = getStorageSettingsV1();
  const cfg = resolveRealQnapWebDavForListSave(settings);
  if (!cfg) {
    return {
      ok: false,
      mock: false,
      projectId,
      message:
        "QNAP接続情報が未設定です。ストレージ設定または QNAP_WEBDAV_URL / QNAP_HOST を確認してください",
      files: [],
      error: "qnap not configured",
    };
  }

  const kinds: Array<"estimate" | "invoice"> = [];
  if (project.estimateId) kinds.push("estimate");
  if (project.invoiceId) kinds.push("invoice");

  const files: EstimateInvoiceQnapSaveFileV1[] = [];

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
    const uploaded = await uploadOneReal(cfg, abs, remoteRel);
    files.push({
      kind,
      localPath: localAbs,
      remotePath: remoteRel,
      displayPath,
      mock: false,
      ok: uploaded.ok,
      error: uploaded.error,
    });
  }

  const allOk = files.length > 0 && files.every((f) => f.ok);
  if (allOk) {
    const savedHost =
      (() => {
        try {
          const u = new URL(cfg.webdavUrl);
          return u.hostname || DOCUMENT_NAS_HOST;
        } catch {
          return settings.qnap.host || DOCUMENT_NAS_HOST;
        }
      })();
    return {
      ok: true,
      mock: false,
      projectId,
      message: documentNasSaveSuccessMessage(savedHost),
      files,
    };
  }

  const firstErr =
    files.find((f) => !f.ok)?.error || "QNAP保存に失敗しました";
  return {
    ok: false,
    mock: false,
    projectId,
    message: firstErr,
    files,
    error: firstErr,
  };
}
