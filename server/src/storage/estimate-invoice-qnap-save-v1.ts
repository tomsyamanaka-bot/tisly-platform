/**
 * 見積一覧 — 請求書作成済み案件の
 * 見積書・請求書 PDF を QNAP へ保存（v1）
 *
 * 保存先: TiSLY_Storage/Invoices_Estimates/YYYY-MM/
 * 本番未接続時はモックへフォールバック（画面は止めない）
 */
import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
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
  isQnapStorageMockMode,
  settingsToWebDavConfig,
} from "./qnap-storage-service.js";

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

function mockMirrorRoot(): string {
  return path.join(process.cwd(), "uploads", "qnap-storage-mock");
}

function resolveLocalAbsolute(localPath: string): string | null {
  if (!localPath?.trim()) return null;
  if (path.isAbsolute(localPath) && fs.existsSync(localPath)) return localPath;
  const full = path.join(process.cwd(), localPath.replace(/^\//, ""));
  return fs.existsSync(full) ? full : null;
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

async function uploadOne(
  settings: StorageSettingsV1,
  localAbs: string,
  remoteRel: string
): Promise<{ ok: boolean; mock: boolean; error?: string }> {
  const useMock = isQnapStorageMockMode(settings);
  if (useMock) {
    try {
      const dest = path.join(mockMirrorRoot(), remoteRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(localAbs, dest);
      console.log(
        `[QNAP MOCK] Invoices_Estimates backup — ${remoteRel}`
      );
      return { ok: true, mock: true };
    } catch (e) {
      return {
        ok: false,
        mock: true,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  try {
    const cfg = settingsToWebDavConfig(settings);
    const client = new QnapWebDavClient(cfg);
    await client.uploadLocalFiles([
      { localPath: localAbs, remotePath: remoteRel },
    ]);
    return { ok: true, mock: false };
  } catch (e) {
    // 本番失敗時もモックへフォールバック（画面停止防止）
    try {
      const dest = path.join(mockMirrorRoot(), remoteRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(localAbs, dest);
      console.warn(
        `[QNAP FALLBACK] WebDAV failed, mirrored locally: ${remoteRel}`,
        e instanceof Error ? e.message : e
      );
      return {
        ok: true,
        mock: true,
        error: e instanceof Error ? e.message : String(e),
      };
    } catch (mirrorErr) {
      return {
        ok: false,
        mock: false,
        error:
          mirrorErr instanceof Error
            ? mirrorErr.message
            : e instanceof Error
              ? e.message
              : String(e),
      };
    }
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
 * 請求書作成済み案件の見積書・請求書を
 * QNAP（またはモック）へ保存する。
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
  if (!project.invoiceId) {
    return {
      ok: false,
      mock: false,
      projectId,
      message: "請求書が未作成のため保存できません",
      files: [],
      error: "invoice not created",
    };
  }

  const settings = getStorageSettingsV1();
  const kinds: Array<"estimate" | "invoice"> = ["estimate", "invoice"];
  const files: EstimateInvoiceQnapSaveFileV1[] = [];

  for (const kind of kinds) {
    const localAbs = await ensureKindPdf(projectId, kind);
    if (!localAbs) {
      files.push({
        kind,
        localPath: "",
        remotePath: "",
        displayPath: "",
        mock: isQnapStorageMockMode(settings),
        ok: false,
        error: `${kind} PDF を生成できませんでした`,
      });
      continue;
    }
    const abs = resolveLocalAbsolute(localAbs) ?? localAbs;
    const fileName = buildRemoteFileName(projectId, kind, abs);
    const remoteRel = buildInvoicesEstimatesBackupRelativePathV1(fileName);
    const displayPath = buildInvoicesEstimatesBackupDisplayPathV1(fileName);
    const uploaded = await uploadOne(settings, abs, remoteRel);
    files.push({
      kind,
      localPath: localAbs,
      remotePath: remoteRel,
      displayPath,
      mock: uploaded.mock,
      ok: uploaded.ok,
      error: uploaded.error,
    });
  }

  const allOk = files.length > 0 && files.every((f) => f.ok);
  const anyMock = files.some((f) => f.mock);
  if (allOk) {
    return {
      ok: true,
      mock: anyMock,
      projectId,
      message: "QNAPへ見積書・請求書を保存しました",
      files,
    };
  }

  const firstErr =
    files.find((f) => !f.ok)?.error || "QNAP保存に失敗しました";
  return {
    ok: false,
    mock: anyMock,
    projectId,
    message: firstErr,
    files,
    error: firstErr,
  };
}
