/**
 * 案件書類 v1 — 状態表示・PDFプリフェッチ・自動再生成フラグ
 */
import path from "path";
import {
  getBusinessProject,
  getCompletionReport,
  getEstimate,
  getInvoice,
} from "../business/business-store.js";
import { isValidPdfFile } from "../business/pdf/pdf-validation.js";
import {
  buildProjectPdfFileNameForProject,
  regenerateProjectPdfV1,
  resolveProjectPdfFile,
  type ProjectPdfKind,
} from "./project-pdf-store.js";
import { getProjectPdfMeta } from "./project-pdf-qnap-store.js";
import {
  getLatestStorageDocumentForKindV1,
  mapPracticalKindToDocumentType,
  storageStatusPresentation,
  type StorageDocumentStatusV1,
} from "../storage/storage-documents-v1-store.js";
import { isQnapWebDavConfigured, resolveQnapStorageProviderKind } from "../storage/qnap-storage-v1-config.js";
import {
  buildCompletionReportContextV1,
  buildSpecificationContextV1,
} from "../estimate/estimate-v1-store.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import { listCompletionPhotosV1 } from "../estimate/completion-photos-store.js";
import type { PracticalDocKind } from "./project-pdf-stale-v1.js";
import { isProjectPdfStaleV1, clearProjectPdfStaleV1 } from "./project-pdf-stale-v1.js";

export type { PracticalDocKind } from "./project-pdf-stale-v1.js";

export type DocumentStatusCode =
  | "not_created"
  | "ready"
  | "stale"
  | "photos_missing"
  | "completion_photos_missing";

export interface DocumentStatusEntryV1 {
  kind: PracticalDocKind;
  label: string;
  status: DocumentStatusCode;
  statusLabel: string;
  statusIcon: string;
  hasPdf: boolean;
  stale: boolean;
  fileName: string | null;
  viewerKind: string;
  pdfUrl: string | null;
  shareFileName: string | null;
  updatedAt: string | null;
  storageStatus: StorageDocumentStatusV1;
  storageStatusLabel: string;
  storageStatusIcon: string;
  storageDocumentId: string | null;
  qnapPath: string | null;
  hasPhotos: boolean;
}

export interface ProjectDocumentsStatusV1 {
  projectId: string;
  qnapConfigured: boolean;
  qnapProviderKind: string;
  documents: DocumentStatusEntryV1[];
}

export interface PrefetchProjectPdfsResultV1 {
  projectId: string;
  prefetched: PracticalDocKind[];
  skipped: PracticalDocKind[];
  errors: Array<{ kind: PracticalDocKind; message: string }>;
  elapsedMs: number;
}

const DOC_LABELS: Record<PracticalDocKind, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  completion: "完了報告書",
};

const VIEWER_KINDS: Record<PracticalDocKind, string> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  completion: "completion-report",
};

const STALE_KIND_MAP: Record<PracticalDocKind, ProjectPdfKind | null> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  completion: "report",
};

function resolveLocalPdf(storedPath: string | null | undefined): string | null {
  if (!storedPath?.trim()) return null;
  const local = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  return isValidPdfFile(local) ? local : null;
}

function pdfApiUrl(projectId: string, kind: PracticalDocKind): string | null {
  const base = `/api/estimate/v1/projects/${projectId}`;
  switch (kind) {
    case "estimate":
      return `${base}/pdf?includePhotos=false`;
    case "invoice":
      return `${base}/invoice/pdf?includePhotos=false`;
    case "specification":
      return `${base}/specification/pdf`;
    case "completion":
      return `${base}/completion-report/pdf`;
  }
}

function statusPresentation(code: DocumentStatusCode): { label: string; icon: string } {
  switch (code) {
    case "ready":
      return { label: "作成済", icon: "✅" };
    case "stale":
      return { label: "更新あり", icon: "🔄" };
    case "photos_missing":
      return { label: "写真不足", icon: "📷" };
    case "completion_photos_missing":
      return { label: "写真不足", icon: "📷" };
    default:
      return { label: "未作成", icon: "⚠️" };
  }
}

function resolveStoredPdfPath(projectId: string, kind: PracticalDocKind): string | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;
  if (kind === "estimate" && project.estimateId) {
    return getEstimate(project.estimateId)?.pdfPath ?? null;
  }
  if (kind === "invoice" && project.invoiceId) {
    return getInvoice(project.invoiceId)?.pdfPath ?? null;
  }
  if (kind === "specification") {
    return getProjectPdfMeta(projectId, "specification")?.localPath ?? null;
  }
  if (kind === "completion" && project.completionReportId) {
    return getCompletionReport(project.completionReportId)?.pdfPath ?? null;
  }
  return null;
}

function resolveShareFileName(projectId: string, kind: PracticalDocKind): string | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const pdfKind: ProjectPdfKind =
    kind === "completion" ? "report" : (kind as ProjectPdfKind);
  return buildProjectPdfFileNameForProject(pdfKind, project, estimate ?? undefined);
}

function surveyPhotoCount(projectId: string): number {
  const project = getBusinessProject(projectId);
  if (!project?.surveyProjectId) return 0;
  return listSurveyPhotosV1(project.surveyProjectId).length;
}

function resolveStorageStatus(projectId: string, kind: PracticalDocKind): {
  status: StorageDocumentStatusV1;
  label: string;
  icon: string;
  documentId: string | null;
  qnapPath: string | null;
} {
  const qnapConfigured = isQnapWebDavConfigured();
  const qnapMockMode = resolveQnapStorageProviderKind() === "mock";
  const storageOpts = { mockMode: qnapMockMode };
  const docType = mapPracticalKindToDocumentType(kind);
  const stored = getLatestStorageDocumentForKindV1(projectId, docType);
  if (stored) {
    const pres = storageStatusPresentation(stored.status, qnapConfigured, storageOpts);
    return {
      status: stored.status,
      label: pres.label,
      icon: pres.icon,
      documentId: stored.id,
      qnapPath: stored.qnapPath,
    };
  }
  const pdfKind = STALE_KIND_MAP[kind];
  const meta = pdfKind ? getProjectPdfMeta(projectId, pdfKind) : null;
  if (meta?.qnapBackupStatus === "success") {
    const pres = storageStatusPresentation("qnap_synced", qnapConfigured, storageOpts);
    return {
      status: "qnap_synced",
      label: pres.label,
      icon: pres.icon,
      documentId: null,
      qnapPath: meta.qnapBackupPath,
    };
  }
  if (meta?.qnapBackupStatus === "failed") {
    const pres = storageStatusPresentation("qnap_failed", qnapConfigured, storageOpts);
    return {
      status: "qnap_failed",
      label: pres.label,
      icon: pres.icon,
      documentId: null,
      qnapPath: null,
    };
  }
  const pres = storageStatusPresentation("qnap_pending", qnapConfigured, storageOpts);
  return {
    status: "qnap_pending",
    label: pres.label,
    icon: pres.icon,
    documentId: null,
    qnapPath: null,
  };
}

function completionPhotoCount(projectId: string): number {
  return listCompletionPhotosV1(projectId).length;
}

function resolveHasPhotos(projectId: string, kind: PracticalDocKind): boolean {
  if (kind === "specification") return surveyPhotoCount(projectId) > 0;
  if (kind === "completion") return completionPhotoCount(projectId) > 0;
  return false;
}

function resolveDocumentStatus(projectId: string, kind: PracticalDocKind): DocumentStatusEntryV1 {
  const project = getBusinessProject(projectId);
  const label = DOC_LABELS[kind];
  const stale = isProjectPdfStaleV1(projectId, kind);
  const storedPath = resolveStoredPdfPath(projectId, kind);
  const hasPdf = Boolean(resolveLocalPdf(storedPath));
  const fileName = storedPath ? path.basename(storedPath) : null;

  let status: DocumentStatusCode = "not_created";

  if (kind === "estimate") {
    if (!project?.estimateId) status = "not_created";
    else if (stale || !hasPdf) status = stale ? "stale" : hasPdf ? "ready" : "not_created";
    else status = "ready";
  } else if (kind === "invoice") {
    if (!project?.invoiceId) status = "not_created";
    else if (stale || !hasPdf) status = stale ? "stale" : hasPdf ? "ready" : "not_created";
    else status = "ready";
  } else if (kind === "specification") {
    const ctx = buildSpecificationContextV1(projectId);
    if (!ctx) status = "not_created";
    else if (surveyPhotoCount(projectId) === 0) status = "photos_missing";
    else if (stale || !hasPdf) status = stale ? "stale" : hasPdf ? "ready" : "not_created";
    else status = "ready";
  } else {
    const ctx = buildCompletionReportContextV1(projectId);
    if (!ctx) status = "not_created";
    else if (completionPhotoCount(projectId) === 0) status = "completion_photos_missing";
    else if (stale || !hasPdf) status = stale ? "stale" : hasPdf ? "ready" : "not_created";
    else status = "ready";
  }

  const pres = statusPresentation(status);
  const storage = resolveStorageStatus(projectId, kind);
  return {
    kind,
    label,
    status,
    statusLabel: pres.label,
    statusIcon: pres.icon,
    hasPdf,
    stale,
    fileName,
    viewerKind: VIEWER_KINDS[kind],
    pdfUrl: pdfApiUrl(projectId, kind),
    shareFileName: resolveShareFileName(projectId, kind),
    updatedAt: hasPdf && storedPath ? resolveLocalPdf(storedPath) ? new Date().toISOString() : null : null,
    storageStatus: storage.status,
    storageStatusLabel: storage.label,
    storageStatusIcon: storage.icon,
    storageDocumentId: storage.documentId,
    qnapPath: storage.qnapPath,
    hasPhotos: resolveHasPhotos(projectId, kind),
  };
}

export function getProjectDocumentsStatusV1(projectId: string): ProjectDocumentsStatusV1 | null {
  if (!getBusinessProject(projectId)) return null;
  const kinds: PracticalDocKind[] = ["estimate", "invoice", "specification", "completion"];
  return {
    projectId,
    qnapConfigured: isQnapWebDavConfigured(),
    qnapProviderKind: resolveQnapStorageProviderKind(),
    documents: kinds.map((k) => resolveDocumentStatus(projectId, k)),
  };
}

export async function ensureProjectPdfFreshV1(
  projectId: string,
  kind: PracticalDocKind
): Promise<boolean> {
  const project = getBusinessProject(projectId);
  if (!project) return false;

  const stale = isProjectPdfStaleV1(projectId, kind);
  const storedPath = resolveStoredPdfPath(projectId, kind);
  const hasValid = Boolean(resolveLocalPdf(storedPath));

  if (!stale && hasValid) return true;

  if (kind === "estimate" && !project.estimateId) return false;
  if (kind === "invoice" && !project.invoiceId) return false;
  if (kind === "specification" && !buildSpecificationContextV1(projectId)) return false;
  if (kind === "completion" && !buildCompletionReportContextV1(projectId)) return false;

  const pdfKind = STALE_KIND_MAP[kind];
  if (!pdfKind) return false;

  try {
    await regenerateProjectPdfV1(projectId, pdfKind);
    clearProjectPdfStaleV1(projectId, kind);
    return true;
  } catch {
    return false;
  }
}

export async function prefetchProjectPdfsV1(projectId: string): Promise<PrefetchProjectPdfsResultV1> {
  const started = Date.now();
  const prefetched: PracticalDocKind[] = [];
  const skipped: PracticalDocKind[] = [];
  const errors: Array<{ kind: PracticalDocKind; message: string }> = [];
  const kinds: PracticalDocKind[] = ["estimate", "invoice", "specification", "completion"];

  for (const kind of kinds) {
    const status = resolveDocumentStatus(projectId, kind);
    if (status.status === "not_created" || status.status === "photos_missing" || status.status === "completion_photos_missing") {
      skipped.push(kind);
      continue;
    }
    if (!status.stale && status.hasPdf) {
      skipped.push(kind);
      continue;
    }
    try {
      const ok = await ensureProjectPdfFreshV1(projectId, kind);
      if (ok) prefetched.push(kind);
      else skipped.push(kind);
    } catch (e) {
      errors.push({ kind, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    projectId,
    prefetched,
    skipped,
    errors,
    elapsedMs: Date.now() - started,
  };
}

/** PDF API 配信前 — stale または無効ファイルなら自動再生成 */
export async function resolveProjectPdfForServeV1(
  projectId: string,
  kind: PracticalDocKind
): Promise<string | null> {
  const stale = isProjectPdfStaleV1(projectId, kind);
  const existing = resolveProjectPdfFile(
    projectId,
    kind === "completion" ? "report" : (kind as ProjectPdfKind)
  );
  if (!stale && existing && isValidPdfFile(existing)) return existing;
  const ok = await ensureProjectPdfFreshV1(projectId, kind);
  if (!ok) return existing;
  return resolveProjectPdfFile(
    projectId,
    kind === "completion" ? "report" : (kind as ProjectPdfKind)
  );
}
