/**
 * QNAP 保存パス v1 — /TiSLY/projects/{projectNo}_{siteName}/...
 */
import { getBusinessProject, getEstimate, getInvoice } from "../business/business-store.js";
import type { StorageDocumentTypeV1 } from "./storage-documents-v1-store.js";

export type QnapStorageFolderV1 =
  | "estimates"
  | "invoices"
  | "reports"
  | "surveys"
  | "drawings"
  | "photos"
  | "meta";

/** 日本語・記号を維持し、パス区切り等のみ置換 */
export function sanitizeFileName(name: string): string {
  return (
    String(name ?? "")
      .replace(/[/\\:*?"<>|]/g, "_")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim() || "file"
  );
}

export function sanitizePathSegment(segment: string): string {
  return sanitizeFileName(segment);
}

export function documentTypeToQnapFolder(documentType: StorageDocumentTypeV1): QnapStorageFolderV1 {
  switch (documentType) {
    case "estimate":
      return "estimates";
    case "invoice":
      return "invoices";
    case "report":
      return "reports";
    case "specification":
      return "surveys";
    case "survey":
      return "surveys";
    case "drawing":
      return "drawings";
    case "photo":
      return "photos";
    default:
      return "meta";
  }
}

export function buildQnapProjectDirSegment(projectNo: string, siteName: string): string {
  return `${sanitizePathSegment(projectNo)}_${sanitizePathSegment(siteName)}`;
}

export function buildQnapProjectRelativeDir(
  baseDir: string,
  projectNo: string,
  siteName: string
): string {
  const base = baseDir.replace(/^\/+|\/+$/g, "") || "TiSLY";
  const segment = buildQnapProjectDirSegment(projectNo, siteName);
  return `${base}/projects/${segment}`;
}

export function buildQnapRemoteFileName(
  projectId: string,
  documentType: StorageDocumentTypeV1,
  fallbackFileName: string
): string {
  const project = getBusinessProject(projectId);
  const siteName = project?.title ?? project?.customerName ?? "現場";
  const projectNo = project?.projectNo ?? projectId.slice(0, 12);

  if (documentType === "estimate") {
    const est = project?.estimateId ? getEstimate(project.estimateId) : null;
    const no = est?.estimateNo ?? projectNo;
    return `${sanitizeFileName(no)}_${sanitizeFileName(siteName)}_見積書.pdf`;
  }
  if (documentType === "invoice") {
    const inv = project?.invoiceId ? getInvoice(project.invoiceId) : null;
    const no = inv?.invoiceNo ?? projectNo;
    return `${sanitizeFileName(no)}_${sanitizeFileName(siteName)}_請求書.pdf`;
  }
  if (documentType === "report") {
    return `${sanitizeFileName(projectNo)}_${sanitizeFileName(siteName)}_完了報告書.pdf`;
  }
  if (documentType === "specification") {
    return `${sanitizeFileName(projectNo)}_${sanitizeFileName(siteName)}_仕様書.pdf`;
  }
  if (documentType === "drawing") {
    const ext = pathExt(fallbackFileName);
    return `${sanitizeFileName(projectNo)}_${sanitizeFileName(siteName)}_現調図面${ext}`;
  }
  return sanitizeFileName(fallbackFileName);
}

function pathExt(fileName: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return m ? `.${m[1].toLowerCase()}` : ".pdf";
}

export function buildQnapRemotePath(
  baseDir: string,
  projectId: string,
  documentType: StorageDocumentTypeV1,
  fileName: string
): string {
  const project = getBusinessProject(projectId);
  const siteName = project?.title ?? project?.customerName ?? "現場";
  const projectNo = project?.projectNo ?? projectId.slice(0, 12);
  const projectDir = buildQnapProjectRelativeDir(baseDir, projectNo, siteName);
  const folder = documentTypeToQnapFolder(documentType);
  const remoteFileName = buildQnapRemoteFileName(projectId, documentType, fileName);
  return `${projectDir}/${folder}/${remoteFileName}`.replace(/\\/g, "/");
}

export function buildPhotoFileName(
  capturedAt: string,
  category: string,
  sequence: number
): string {
  const ts = capturedAt.replace(/[:.]/g, "-").replace(/\s+/g, "_");
  return `${sanitizeFileName(ts)}_${sanitizeFileName(category)}_${String(sequence).padStart(3, "0")}.jpg`;
}
