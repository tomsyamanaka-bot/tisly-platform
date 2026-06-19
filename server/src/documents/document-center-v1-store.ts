/**
 * TiSLY Document Center v1 — 案件書類一元管理
 */
import path from "path";
import { v4 as uuid } from "uuid";
import {
  getBusinessProject,
  getEstimate,
  getInvoice,
} from "../business/business-store.js";
import { getDatabase } from "../db/database.js";
import { listCompletionPhotosV1 } from "../estimate/completion-photos-store.js";
import {
  backfillProjectTimelineV1,
  formatTimelineDateGroupV1,
  listProjectTimelineEventsV1,
} from "../projects/project-timeline-v1-store.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import { getSurveyDrawingSketchV1, listSurveyDrawingSketchesV1 } from "../survey/survey-drawing-v1-store.js";
import { isQnapWebDavConfigured } from "../storage/qnap-storage-v1-config.js";
import { listProjectStorageV1 } from "../storage/project-storage-v1.js";
import {
  listStorageDocumentsForProjectV1,
  storageStatusPresentation,
  workflowStatusPresentation,
  type StorageDocumentTypeV1,
  type StorageDocumentV1,
} from "../storage/storage-documents-v1-store.js";
import {
  DOCUMENT_CENTER_FOLDER_ORDER,
  DOCUMENT_TYPE_PRESENTATION,
  SOURCE_TYPE_PRESENTATION,
  type DocumentCenterFolderV1,
  type DocumentCenterItemV1,
  type DocumentCenterProjectDetailV1,
  type DocumentCenterProjectSummaryV1,
  type DocumentCenterRecentItemV1,
  type DocumentCenterSearchHitV1,
  type DocumentCenterSearchOptionsV1,
  type DocumentCenterTimelineEntryV1,
  type DocumentCenterTypeV1,
  type DocumentPreviewKindV1,
  type DocumentSourceTypeV1,
  type DrawingPreviewSummaryV1,
} from "./document-center-v1-types.js";

const DOC_EVENT_TYPES = new Set([
  "estimate_created",
  "estimate_pdf_saved",
  "invoice_created",
  "invoice_pdf_saved",
  "specification_created",
  "specification_saved",
  "completion_created",
  "completion_saved",
  "qnap_saved",
  "photo_added",
  "drawing_added",
  "pdf_shared",
]);

const EVENT_TO_DOC_TYPE: Record<string, DocumentCenterTypeV1 | "general"> = {
  estimate_created: "estimate",
  estimate_pdf_saved: "estimate",
  invoice_created: "invoice",
  invoice_pdf_saved: "invoice",
  specification_created: "specification",
  specification_saved: "specification",
  completion_created: "report",
  completion_saved: "report",
  qnap_saved: "general",
  photo_added: "photo",
  drawing_added: "drawing",
  pdf_shared: "general",
};

function normalizeStorageDocType(raw: string): DocumentCenterTypeV1 {
  if (raw === "pdf") return "specification";
  if (raw === "photos") return "photo";
  if (raw === "project") return "other";
  return raw as DocumentCenterTypeV1;
}

function previewKindFor(mimeType: string, fileName: string): DocumentPreviewKindV1 {
  const ext = path.extname(fileName).toLowerCase();
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
    return "image";
  }
  if (ext === ".json" || mimeType === "application/json") return "json";
  return "none";
}

function localUrlFromPath(localPath: string | null): string | null {
  if (!localPath?.trim()) return null;
  if (localPath.startsWith("/uploads/") || localPath.startsWith("uploads/")) {
    return `/${localPath.replace(/^\//, "")}`;
  }
  return null;
}

function itemFromStorageDoc(
  doc: StorageDocumentV1,
  projectNo: string,
  estimateNo: string | null,
  invoiceNo: string | null
): DocumentCenterItemV1 {
  const documentType = normalizeStorageDocType(doc.documentType);
  const pres = DOCUMENT_TYPE_PRESENTATION[documentType];
  const qnapConfigured = isQnapWebDavConfigured();
  const qnapPres = storageStatusPresentation(doc.status, qnapConfigured);
  const wfPres = workflowStatusPresentation(doc.documentType, doc.workflowStatus ?? "draft");
  const previewUrl = localUrlFromPath(doc.localPath);
  const viewerKindMap: Partial<Record<DocumentCenterTypeV1, string>> = {
    estimate: "estimate",
    invoice: "invoice",
    specification: "specification",
    report: "completion-report",
  };
  const viewerKind = viewerKindMap[documentType];
  return {
    id: `storage:${doc.id}`,
    projectId: doc.projectId,
    projectNo,
    customerName: doc.customerName ?? "",
    siteName: doc.siteName ?? "",
    documentType,
    sourceType: doc.sourceType ?? "pdf",
    title: doc.title || pres.label,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    size: doc.size,
    previewKind: previewKindFor(doc.mimeType, doc.fileName),
    previewUrl,
    viewerUrl: viewerKind
      ? `/document-viewer-v1.html?projectId=${encodeURIComponent(doc.projectId)}&kind=${viewerKind}`
      : previewUrl,
    localPath: doc.localPath,
    storageDocumentId: doc.id,
    qnapStatus: doc.status,
    qnapStatusLabel: qnapPres.label,
    qnapStatusIcon: qnapPres.icon,
    estimateNo,
    invoiceNo,
    workflowStatus: doc.workflowStatus ?? "draft",
    workflowStatusLabel: wfPres.label,
    memo: doc.memo,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function collectProjectItems(projectId: string): DocumentCenterItemV1[] {
  const project = getBusinessProject(projectId);
  if (!project) return [];

  const projectNo = project.projectNo ?? project.id;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const invoice = project.invoiceId ? getInvoice(project.invoiceId) : null;
  const estimateNo = estimate?.estimateNo ?? null;
  const invoiceNo = invoice?.invoiceNo ?? null;

  const items: DocumentCenterItemV1[] = [];
  const seen = new Set<string>();

  const push = (item: DocumentCenterItemV1) => {
    const key = `${item.documentType}|${item.fileName}|${item.localPath ?? item.previewUrl ?? item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const doc of listStorageDocumentsForProjectV1(projectId)) {
    push(itemFromStorageDoc(doc, projectNo, estimateNo, invoiceNo));
  }

  try {
    const storage = listProjectStorageV1(projectId);
    for (const folder of storage.folderContents ?? []) {
      const folderType = mapStorageFolderType(folder.folderType);
      if (!folderType) continue;
      for (const file of folder.files ?? []) {
        const pres = DOCUMENT_TYPE_PRESENTATION[folderType];
        const fileUrl = `/api/project-storage/${encodeURIComponent(projectId)}/file?relativePath=${encodeURIComponent(file.relativePath)}`;
        const mimeType =
          file.mediaKind === "pdf"
            ? "application/pdf"
            : file.mediaKind === "image"
              ? "image/jpeg"
              : "application/octet-stream";
        push({
          id: `file:${projectId}:${folder.folderType}:${file.fileName}`,
          projectId,
          projectNo,
          customerName: project.customerName ?? "",
          siteName: project.title ?? "",
          documentType: folderType,
          sourceType: folderType === "drawing" ? "drawing" : "manual",
          title: file.displayName || pres.label,
          fileName: file.fileName,
          mimeType,
          size: file.sizeBytes ?? 0,
          previewKind: previewKindFor(mimeType, file.fileName),
          previewUrl: fileUrl,
          viewerUrl: fileUrl,
          localPath: file.relativePath,
          storageDocumentId: null,
          qnapStatus: storage.qnapSyncStatus ?? null,
          qnapStatusLabel: storage.qnapSyncLabel ?? null,
          qnapStatusIcon: storage.qnapSyncIcon ?? null,
          estimateNo,
          invoiceNo,
          workflowStatus: null,
          workflowStatusLabel: null,
          memo: null,
          createdAt: file.savedAt ?? new Date().toISOString(),
          updatedAt: file.savedAt ?? new Date().toISOString(),
        });
      }
    }
  } catch {
    /* project storage optional */
  }

  if (project.surveyProjectId) {
    for (const photo of listSurveyPhotosV1(project.surveyProjectId)) {
      push({
        id: `photo:survey:${photo.id}`,
        projectId,
        projectNo,
        customerName: project.customerName ?? "",
        siteName: project.title ?? "",
        documentType: "photo",
        sourceType: "manual",
        title: photo.title?.trim() || photo.comment?.trim() || "現調写真",
        fileName: path.basename(photo.url ?? photo.id),
        mimeType: "image/jpeg",
        size: 0,
        previewKind: "image",
        previewUrl: photo.url ?? null,
        viewerUrl: photo.url ?? null,
        localPath: null,
        storageDocumentId: null,
        qnapStatus: null,
        qnapStatusLabel: null,
        qnapStatusIcon: null,
        estimateNo,
        invoiceNo,
        workflowStatus: null,
        workflowStatusLabel: null,
        memo: null,
        createdAt: photo.createdAt ?? new Date().toISOString(),
        updatedAt: photo.createdAt ?? new Date().toISOString(),
      });
    }

    for (const sketch of listSurveyDrawingSketchesV1(project.surveyProjectId)) {
      push({
        id: `drawing:sketch:${sketch.id}`,
        projectId,
        projectNo,
        customerName: project.customerName ?? "",
        siteName: project.title ?? "",
        documentType: "drawing",
        sourceType: "drawing",
        title: sketch.title?.trim() || "現調図面",
        fileName: `${sketch.id}.json`,
        mimeType: "application/json",
        size: 0,
        previewKind: "json",
        previewUrl: `/api/survey/v1/projects/${project.surveyProjectId}/drawing-sketches/${sketch.id}`,
        viewerUrl: `/survey-drawing-v1?projectId=${encodeURIComponent(project.surveyProjectId)}&sketchId=${encodeURIComponent(sketch.id)}`,
        localPath: null,
        storageDocumentId: null,
        qnapStatus: null,
        qnapStatusLabel: null,
        qnapStatusIcon: null,
        estimateNo,
        invoiceNo,
        workflowStatus: null,
        workflowStatusLabel: null,
        memo: null,
        createdAt: sketch.createdAt ?? new Date().toISOString(),
        updatedAt: sketch.updatedAt ?? sketch.createdAt ?? new Date().toISOString(),
      });
    }
  }

  for (const photo of listCompletionPhotosV1(projectId)) {
    push({
      id: `photo:completion:${photo.id}`,
      projectId,
      projectNo,
      customerName: project.customerName ?? "",
      siteName: project.title ?? "",
      documentType: "photo",
      sourceType: "manual",
      title: photo.title?.trim() || "完了写真",
      fileName: path.basename(photo.url ?? photo.id),
      mimeType: "image/jpeg",
      size: 0,
      previewKind: "image",
      previewUrl: photo.url ?? null,
      viewerUrl: photo.url ?? null,
      localPath: null,
      storageDocumentId: null,
      qnapStatus: null,
      qnapStatusLabel: null,
      qnapStatusIcon: null,
      estimateNo,
      invoiceNo,
      workflowStatus: null,
      workflowStatusLabel: null,
      memo: null,
      createdAt: photo.createdAt ?? new Date().toISOString(),
      updatedAt: photo.createdAt ?? new Date().toISOString(),
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mapStorageFolderType(
  folderType: string
): DocumentCenterTypeV1 | null {
  const map: Record<string, DocumentCenterTypeV1> = {
    estimate: "estimate",
    invoice: "invoice",
    specification: "specification",
    completion: "report",
    photos: "photo",
    drawings: "drawing",
    survey: "survey",
    others: "other",
  };
  return map[folderType] ?? null;
}

function buildFolders(items: DocumentCenterItemV1[]): DocumentCenterFolderV1[] {
  const byType = new Map<DocumentCenterTypeV1, DocumentCenterItemV1[]>();
  for (const item of items) {
    const list = byType.get(item.documentType) ?? [];
    list.push(item);
    byType.set(item.documentType, list);
  }
  return DOCUMENT_CENTER_FOLDER_ORDER.filter((t) => (byType.get(t)?.length ?? 0) > 0).map(
    (folderType) => {
      const folderItems = byType.get(folderType) ?? [];
      const pres = DOCUMENT_TYPE_PRESENTATION[folderType];
      return {
        folderType,
        label: pres.folderLabel,
        icon: pres.icon,
        color: pres.color,
        bg: pres.bg,
        count: folderItems.length,
        items: folderItems,
      };
    }
  );
}

function isFavorite(projectId: string, username: string): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT 1 FROM document_center_favorites_v1 WHERE project_id = ? AND username = ?`
    )
    .get(projectId, username);
  return Boolean(row);
}

function listActiveProjects(): Array<Record<string, unknown>> {
  return getDatabase()
    .prepare(
      `SELECT id, project_no, title, customer_name, assignee, updated_at
       FROM business_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC`
    )
    .all() as Array<Record<string, unknown>>;
}

export function listDocumentCenterProjectsV1(username: string): DocumentCenterProjectSummaryV1[] {
  return listActiveProjects().map((row) => {
    const projectId = String(row.id);
    const items = collectProjectItems(projectId);
    const folderCounts: Partial<Record<DocumentCenterTypeV1, number>> = {};
    for (const item of items) {
      folderCounts[item.documentType] = (folderCounts[item.documentType] ?? 0) + 1;
    }
    return {
      projectId,
      projectNo: String(row.project_no ?? projectId),
      customerName: String(row.customer_name ?? ""),
      siteName: String(row.title ?? ""),
      assignee: String(row.assignee ?? ""),
      favorite: isFavorite(projectId, username),
      documentCount: items.length,
      folderCounts,
      updatedAt: String(row.updated_at ?? ""),
    };
  });
}

export function getDocumentCenterProjectV1(
  projectId: string,
  username: string
): DocumentCenterProjectDetailV1 | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;

  const items = collectProjectItems(projectId);
  backfillProjectTimelineV1(projectId);
  const timeline = buildDocumentTimeline(projectId);

  return {
    projectId,
    projectNo: project.projectNo ?? projectId,
    customerName: project.customerName ?? "",
    siteName: project.title ?? "",
    assignee: project.assignee ?? "",
    favorite: isFavorite(projectId, username),
    qnapConfigured: isQnapWebDavConfigured(),
    folders: buildFolders(items),
    timeline,
    totalDocuments: items.length,
  };
}

function buildDocumentTimeline(projectId: string): DocumentCenterTimelineEntryV1[] {
  return listProjectTimelineEventsV1(projectId, { limit: 100 })
    .filter((e) => DOC_EVENT_TYPES.has(e.eventType))
    .map((e) => {
      const d = new Date(e.createdAt);
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return {
        id: e.id,
        date: e.createdAt,
        dateLabel: `${mo}/${da}`,
        title: e.title,
        description: e.description,
        documentType: EVENT_TO_DOC_TYPE[e.eventType] ?? "general",
        category: e.category,
      };
    });
}

export function getDocumentCenterTimelineV1(projectId: string): DocumentCenterTimelineEntryV1[] {
  if (!getBusinessProject(projectId)) return [];
  backfillProjectTimelineV1(projectId);
  return buildDocumentTimeline(projectId);
}

export function searchDocumentCenterV1(
  queryOrOptions: string | DocumentCenterSearchOptionsV1,
  limitArg = 50
): DocumentCenterSearchHitV1[] {
  const opts: DocumentCenterSearchOptionsV1 =
    typeof queryOrOptions === "string" ? { query: queryOrOptions, limit: limitArg } : queryOrOptions;
  const q = (opts.query ?? "").trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const docTypeFilter = opts.documentType ?? "all";
  const qnapFilter = opts.qnapStatus ?? "all";
  const sourceFilter = opts.sourceType ?? "all";
  const sort = opts.sort ?? "created";

  const recentAccess = new Map<string, string>();
  if (sort === "recent" && opts.username) {
    for (const r of listDocumentCenterRecentV1(opts.username, 30)) {
      recentAccess.set(`${r.projectId}|${r.documentId}`, r.accessedAt);
    }
  }

  const hits: DocumentCenterSearchHitV1[] = [];

  for (const row of listActiveProjects()) {
    if (hits.length >= limit) break;
    const projectId = String(row.id);
    const projectNo = String(row.project_no ?? projectId);
    const customerName = String(row.customer_name ?? "");
    const siteName = String(row.title ?? "");
    const projectHay = `${projectNo} ${customerName} ${siteName}`.toLowerCase();
    const projectMatch = q ? projectHay.includes(q) : false;

    const items = collectProjectItems(projectId);
    for (const item of items) {
      if (hits.length >= limit) break;
      if (docTypeFilter !== "all" && item.documentType !== docTypeFilter) continue;
      if (sourceFilter !== "all" && item.sourceType !== sourceFilter) continue;
      if (qnapFilter !== "all") {
        const st = item.qnapStatus ?? "qnap_pending";
        if (qnapFilter === "pending" && st !== "qnap_pending") continue;
        if (qnapFilter === "synced" && st !== "qnap_synced") continue;
        if (qnapFilter === "failed" && st !== "qnap_failed") continue;
        if (qnapFilter === "syncing" && st !== "qnap_syncing") continue;
      }

      const typeLabel = DOCUMENT_TYPE_PRESENTATION[item.documentType]?.label ?? item.documentType;
      const sourceLabel = SOURCE_TYPE_PRESENTATION[item.sourceType]?.label ?? item.sourceType;
      const qnapLabel = item.qnapStatusLabel ?? "";
      const fields: Array<[string, string | null]> = [
        ["案件名", siteName],
        ["顧客名", customerName],
        ["現場名", siteName],
        ["見積番号", item.estimateNo],
        ["請求番号", item.invoiceNo],
        ["ファイル名", item.fileName],
        ["タイトル", item.title],
        ["書類名", item.title],
        ["documentType", typeLabel],
        ["sourceType", sourceLabel],
        ["QNAP状態", qnapLabel],
      ];
      let matchedField = "";
      if (!q) {
        matchedField = "一覧";
      } else if (projectMatch) {
        matchedField = "案件";
      } else {
        for (const [label, val] of fields) {
          if (val && val.toLowerCase().includes(q)) {
            matchedField = label;
            break;
          }
        }
        if (!matchedField) {
          const hay = [
            item.documentType,
            item.sourceType,
            item.qnapStatus ?? "",
            item.workflowStatus ?? "",
          ]
            .join(" ")
            .toLowerCase();
          if (hay.includes(q)) matchedField = "メタデータ";
        }
      }
      if (q && !matchedField) continue;

      hits.push({
        projectId,
        projectNo,
        customerName,
        siteName,
        documentId: item.id,
        documentType: item.documentType,
        sourceType: item.sourceType,
        title: item.title,
        fileName: item.fileName,
        estimateNo: item.estimateNo,
        invoiceNo: item.invoiceNo,
        previewUrl: item.previewUrl,
        qnapStatus: item.qnapStatus,
        qnapStatusLabel: item.qnapStatusLabel,
        qnapStatusIcon: item.qnapStatusIcon,
        workflowStatus: item.workflowStatus,
        workflowStatusLabel: item.workflowStatusLabel,
        matchedField,
        createdAt: item.createdAt,
        accessedAt: recentAccess.get(`${projectId}|${item.id}`) ?? null,
      });
    }
  }

  if (sort === "recent") {
    hits.sort((a, b) => {
      const aT = a.accessedAt ?? a.createdAt;
      const bT = b.accessedAt ?? b.createdAt;
      return bT.localeCompare(aT);
    });
  } else {
    hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return hits.slice(0, limit);
}

export function toggleDocumentCenterFavoriteV1(
  projectId: string,
  username: string
): { favorite: boolean } {
  if (!getBusinessProject(projectId)) throw new Error("project not found");
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT 1 FROM document_center_favorites_v1 WHERE project_id = ? AND username = ?`)
    .get(projectId, username);
  if (existing) {
    db.prepare(`DELETE FROM document_center_favorites_v1 WHERE project_id = ? AND username = ?`).run(
      projectId,
      username
    );
    return { favorite: false };
  }
  db.prepare(
    `INSERT INTO document_center_favorites_v1 (project_id, username, created_at) VALUES (?, ?, ?)`
  ).run(projectId, username, new Date().toISOString());
  return { favorite: true };
}

export function listDocumentCenterFavoritesV1(
  username: string
): DocumentCenterProjectSummaryV1[] {
  return listDocumentCenterProjectsV1(username).filter((p) => p.favorite);
}

export function recordDocumentCenterRecentV1(input: {
  username: string;
  projectId: string;
  documentId: string;
  documentType: DocumentCenterTypeV1;
  title: string;
  fileName: string;
  previewUrl?: string | null;
}): void {
  const project = getBusinessProject(input.projectId);
  if (!project) return;
  const now = new Date().toISOString();
  const id = uuid();
  const db = getDatabase();
  db.prepare(
    `DELETE FROM document_center_recent_v1
     WHERE username = ? AND project_id = ? AND document_id = ?`
  ).run(input.username, input.projectId, input.documentId);
  db.prepare(
    `INSERT INTO document_center_recent_v1 (
      id, username, project_id, document_id, document_type, title, file_name, preview_url, accessed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.username,
    input.projectId,
    input.documentId,
    input.documentType,
    input.title,
    input.fileName,
    input.previewUrl ?? null,
    now
  );
  const overflow = db
    .prepare(
      `SELECT id FROM document_center_recent_v1 WHERE username = ?
       ORDER BY accessed_at DESC LIMIT -1 OFFSET 30`
    )
    .all(input.username) as Array<{ id: string }>;
  for (const row of overflow) {
    db.prepare(`DELETE FROM document_center_recent_v1 WHERE id = ?`).run(row.id);
  }
}

export function listDocumentCenterRecentV1(
  username: string,
  limit = 10
): DocumentCenterRecentItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT r.*, p.project_no, p.customer_name
       FROM document_center_recent_v1 r
       JOIN business_projects p ON p.id = r.project_id
       WHERE r.username = ? AND p.deleted_at IS NULL
       ORDER BY r.accessed_at DESC LIMIT ?`
    )
    .all(username, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    projectNo: String(r.project_no ?? r.project_id),
    customerName: String(r.customer_name ?? ""),
    documentId: String(r.document_id),
    documentType: String(r.document_type) as DocumentCenterTypeV1,
    title: String(r.title),
    fileName: String(r.file_name),
    previewUrl: r.preview_url != null ? String(r.preview_url) : null,
    accessedAt: String(r.accessed_at),
  }));
}

export function resolveDocumentCenterItemV1(
  projectId: string,
  documentId: string
): DocumentCenterItemV1 | null {
  return collectProjectItems(projectId).find((i) => i.id === documentId) ?? null;
}

export function getDocumentCenterPreviewV1(
  projectId: string,
  documentId: string
): {
  item: DocumentCenterItemV1;
  jsonContent?: unknown;
  drawingSummary?: DrawingPreviewSummaryV1;
} | null {
  const item = resolveDocumentCenterItemV1(projectId, documentId);
  if (!item) return null;
  if (item.previewKind !== "json") return { item };
  const sketchId = documentId.replace(/^drawing:sketch:/, "");
  const sketch = getSurveyDrawingSketchV1(sketchId);
  const layers = sketch?.layers;
  const wirePaths = (layers?.paths ?? []).filter(
    (p) => p.tool === "route" || p.tool === "line"
  );
  const lineTypes = new Set(wirePaths.map((p) => p.lineType ?? "generic"));
  const drawingSummary: DrawingPreviewSummaryV1 = {
    layerCount: lineTypes.size || (layers?.paths?.length ? 1 : 0),
    symbolCount: layers?.symbols?.length ?? 0,
    wireCount: wirePaths.length,
    title: sketch?.title,
  };
  return { item, jsonContent: sketch ?? null, drawingSummary };
}

export function formatDocumentTimelineGroupV1(iso: string): string {
  return formatTimelineDateGroupV1(iso);
}

/** 検索性能計測用 */
export function measureDocumentCenterSearchMs(query: string): number {
  const started = Date.now();
  searchDocumentCenterV1(query, 50);
  return Date.now() - started;
}
