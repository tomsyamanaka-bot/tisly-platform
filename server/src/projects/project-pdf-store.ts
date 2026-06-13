/**
 * 案件単位 PDF 管理 — uploads/business/{projectId}/pdfs/
 *
 * 保存仕様（固定）: docs/project-pdf-storage-spec.md
 * QNAP バックアップ計画: docs/qnap-pdf-backup-plan.md
 *
 * 現時点は local 固定 + QNAP バックアップ（project_pdf_meta）。
 */
import fs from "fs";
import path from "path";
import {
  businessUploadsDir,
  getBusinessProject,
  getCompletionReport,
  getEstimate,
  getInvoice,
  setCompletionReportPdfPath,
  setEstimatePdfPath,
  setInvoicePdfPath,
} from "../business/business-store.js";
import {
  generateCompletionReportPdfV1,
  generateEstimatePdf,
  generateInvoicePdf,
} from "../business/services/pdfService.js";
import {
  getEstimatePdfContextV1,
  renderCompletionReportHtmlV1,
  generateAndSaveSpecificationPdfV1,
} from "../estimate/estimate-v1-store.js";
import {
  recordProjectPdfSavedV1,
  softDeleteProjectPdfMeta,
  getProjectPdfMeta,
  toQnapPublicMeta,
  type ProjectPdfQnapPublicV1,
} from "./project-pdf-qnap-store.js";
import { getStorageSettingsV1 } from "../storage/storage-settings-store.js";
import { isValidPdfFile } from "../business/pdf/pdf-validation.js";

/** 現在は local のみ。将来 qnap へ切替 */
export type PdfStorageProvider = "local" | "qnap";
export const PDF_STORAGE_PROVIDER: PdfStorageProvider = "local";

export type ProjectPdfKind = "estimate" | "invoice" | "report" | "specification";

export const PROJECT_PDF_KIND_LABELS: Record<ProjectPdfKind, string> = {
  estimate: "見積書",
  invoice: "請求書",
  report: "完了報告書",
  specification: "仕様書",
};

function sanitizeSuffix(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim() || "doc";
}

/** 標準ファイル名: estimate-xxxx.pdf / invoice-xxxx.pdf / completion-report-xxxx.pdf / specification-xxxx.pdf */
export function buildProjectPdfFileName(kind: ProjectPdfKind, suffix: string): string {
  const base =
    kind === "report"
      ? "completion-report"
      : kind === "specification"
        ? "specification"
        : kind;
  return `${base}-${sanitizeSuffix(suffix)}.pdf`;
}

export function projectPdfStorageDir(projectId: string): string {
  return businessUploadsDir(projectId, "pdfs");
}

export function projectPdfPublicPath(projectId: string, fileName: string): string {
  return `/uploads/business/${projectId}/pdfs/${fileName}`;
}

function resolveLocalPdf(storedPath: string | null | undefined): string | null {
  if (!storedPath?.trim()) return null;
  const local = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  return fs.existsSync(local) ? local : null;
}

function fileMeta(localPath: string): { sizeBytes: number; createdAt: string; updatedAt: string } {
  const stat = fs.statSync(localPath);
  return {
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
  };
}

export interface ProjectPdfEntryV1 {
  kind: ProjectPdfKind;
  label: string;
  fileName: string | null;
  pdfPath: string | null;
  storagePath: string;
  createdAt: string | null;
  updatedAt: string | null;
  sizeBytes: number | null;
  exists: boolean;
  local: { saved: boolean; label: string };
  qnap: ProjectPdfQnapPublicV1;
}

function entryFromPath(
  kind: ProjectPdfKind,
  pdfPath: string | null,
  storagePath: string,
  qnapOpts?: { includeError?: boolean }
): ProjectPdfEntryV1 {
  const shareName = getStorageSettingsV1().qnap.shareName;
  const projectId = storagePath.match(/uploads\/business\/([^/]+)\//)?.[1] ?? "";
  const meta = projectId ? getProjectPdfMeta(projectId, kind) : null;
  const qnap = toQnapPublicMeta(meta, { includeError: qnapOpts?.includeError, shareName });
  const local = resolveLocalPdf(pdfPath);
  const validLocal = local && isValidPdfFile(local) ? local : null;
  const fileName = pdfPath ? path.basename(pdfPath) : null;
  if (!validLocal) {
    return {
      kind,
      label: PROJECT_PDF_KIND_LABELS[kind],
      fileName,
      pdfPath,
      storagePath,
      createdAt: null,
      updatedAt: null,
      sizeBytes: null,
      exists: false,
      local: { saved: false, label: "未保存" },
      qnap,
    };
  }
  const fileMetaData = fileMeta(validLocal);
  return {
    kind,
    label: PROJECT_PDF_KIND_LABELS[kind],
    fileName: fileName ?? path.basename(validLocal),
    pdfPath,
    storagePath,
    createdAt: fileMetaData.createdAt,
    updatedAt: fileMetaData.updatedAt,
    sizeBytes: fileMetaData.sizeBytes,
    exists: true,
    local: { saved: true, label: "✅ 保存済み" },
    qnap,
  };
}

function estimateSuffix(projectId: string): string {
  const project = getBusinessProject(projectId);
  if (!project?.estimateId) return projectId.slice(-4);
  const est = getEstimate(project.estimateId);
  return est?.estimateNo ?? projectId.slice(-4);
}

function invoiceSuffix(projectId: string): string {
  const project = getBusinessProject(projectId);
  if (!project?.invoiceId) return projectId.slice(-4);
  const inv = getInvoice(project.invoiceId);
  return inv?.invoiceNo ?? projectId.slice(-4);
}

function reportSuffix(projectId: string): string {
  const project = getBusinessProject(projectId);
  return project?.projectNo ?? projectId.slice(-4);
}

function specificationSuffix(projectId: string): string {
  const project = getBusinessProject(projectId);
  return project?.projectNo ?? projectId.slice(-4);
}

export function expectedStoragePath(projectId: string, kind: ProjectPdfKind): string {
  const suffix =
    kind === "estimate"
      ? estimateSuffix(projectId)
      : kind === "invoice"
        ? invoiceSuffix(projectId)
        : kind === "specification"
          ? specificationSuffix(projectId)
          : reportSuffix(projectId);
  return projectPdfPublicPath(projectId, buildProjectPdfFileName(kind, suffix));
}

function dbPdfPath(projectId: string, kind: ProjectPdfKind): string | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;
  if (kind === "specification") {
    return getProjectPdfMeta(projectId, "specification")?.localPath ?? null;
  }
  if (kind === "estimate" && project.estimateId) {
    return getEstimate(project.estimateId)?.pdfPath ?? null;
  }
  if (kind === "invoice" && project.invoiceId) {
    return getInvoice(project.invoiceId)?.pdfPath ?? null;
  }
  if (kind === "report" && project.completionReportId) {
    return getCompletionReport(project.completionReportId)?.pdfPath ?? null;
  }
  return null;
}

export function listProjectPdfsV1(
  projectId: string,
  opts?: { includeQnapError?: boolean }
): ProjectPdfEntryV1[] {
  const kinds: ProjectPdfKind[] = ["specification", "estimate", "report", "invoice"];
  return kinds.map((kind) => {
    const pdfPath = dbPdfPath(projectId, kind);
    return entryFromPath(kind, pdfPath, expectedStoragePath(projectId, kind), {
      includeError: opts?.includeQnapError,
    });
  });
}

export function countExistingProjectPdfsV1(projectId: string): number {
  return listProjectPdfsV1(projectId).filter((e) => e.exists).length;
}

export function resolveProjectPdfFile(projectId: string, kind: ProjectPdfKind): string | null {
  const pdfPath = dbPdfPath(projectId, kind);
  const local = resolveLocalPdf(pdfPath);
  if (!local || !isValidPdfFile(local)) return null;
  return local;
}

export function deleteProjectPdfV1(projectId: string, kind: ProjectPdfKind): boolean {
  const project = getBusinessProject(projectId);
  if (!project) return false;
  const pdfPath = dbPdfPath(projectId, kind);
  const local = resolveLocalPdf(pdfPath);
  if (local) fs.unlinkSync(local);
  if (kind === "estimate" && project.estimateId) {
    setEstimatePdfPath(project.estimateId, "");
  } else if (kind === "invoice" && project.invoiceId) {
    setInvoicePdfPath(project.invoiceId, "");
  } else if (kind === "report" && project.completionReportId) {
    setCompletionReportPdfPath(project.completionReportId, "");
  } else if (kind === "specification") {
    /* meta only */
  }
  softDeleteProjectPdfMeta(projectId, kind);
  return true;
}

function saveProjectPdfWithQnapQueue(
  projectId: string,
  kind: ProjectPdfKind,
  pdfPath: string
): void {
  recordProjectPdfSavedV1(projectId, kind, pdfPath);
}

export async function regenerateProjectPdfV1(
  projectId: string,
  kind: ProjectPdfKind
): Promise<ProjectPdfEntryV1> {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  if (kind === "estimate") {
    if (!project.estimateId) throw new Error("No estimate");
    const estimate = getEstimate(project.estimateId);
    if (!estimate) throw new Error("No estimate");
    const pdfCtx = getEstimatePdfContextV1(projectId) ?? undefined;
    const pdfPath = await generateEstimatePdf(project, estimate, pdfCtx);
    setEstimatePdfPath(estimate.id, pdfPath);
    saveProjectPdfWithQnapQueue(projectId, "estimate", pdfPath);
  } else if (kind === "invoice") {
    if (!project.invoiceId || !project.estimateId) throw new Error("No invoice");
    const invoice = getInvoice(project.invoiceId);
    const estimate = getEstimate(project.estimateId);
    if (!invoice || !estimate) throw new Error("No invoice");
    const pdfPath = await generateInvoicePdf(project, invoice, estimate);
    setInvoicePdfPath(invoice.id, pdfPath);
    saveProjectPdfWithQnapQueue(projectId, "invoice", pdfPath);
  } else if (kind === "specification") {
    const pdfPath = await generateAndSaveSpecificationPdfV1(projectId);
    if (!pdfPath) throw new Error("No specification");
  } else {
    if (!project.completionReportId) throw new Error("No completion report");
    const html = renderCompletionReportHtmlV1(projectId);
    if (!html) throw new Error("No completion report");
    const pdfPath = await generateCompletionReportPdfV1(project, html, reportSuffix(projectId));
    setCompletionReportPdfPath(project.completionReportId, pdfPath);
    saveProjectPdfWithQnapQueue(projectId, "report", pdfPath);
  }

  return entryFromPath(kind, dbPdfPath(projectId, kind), expectedStoragePath(projectId, kind));
}

export function formatPdfSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
