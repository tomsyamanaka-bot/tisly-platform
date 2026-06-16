/**
 * Mock project storage — server/data/project-storage/{案件No}/
 */
import fs from "fs";
import path from "path";
import { getBusinessProject, getEstimate } from "../business/business-store.js";
import { getDatabase } from "../db/database.js";
import { buildQnapFolderPathV1 } from "../projects/project-id-v1.js";
import { getProjectPdfMeta } from "../projects/project-pdf-qnap-store.js";
import {
  buildProjectPdfFileNameForProject,
  type ProjectPdfKind,
} from "../projects/project-pdf-store.js";
import type { ProjectStorageProvider } from "./project-storage-provider.js";

export const PROJECT_STORAGE_SUBFOLDERS = [
  "01_現調",
  "02_見積",
  "03_請求",
  "04_仕様書",
  "05_完了報告",
  "06_写真",
  "07_図面",
  "08_その他",
] as const;

export type ProjectStorageDocKind = "estimate" | "invoice" | "specification" | "report";

export type QnapSyncStatusV1 = "pending" | "synced" | "error";

export const KIND_TO_SUBFOLDER: Record<ProjectStorageDocKind, string> = {
  estimate: "02_見積",
  invoice: "03_請求",
  specification: "04_仕様書",
  report: "05_完了報告",
};

const KIND_TO_VIEWER: Record<ProjectStorageDocKind, string> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  report: "completion-report",
};

const KIND_TO_DOC_LABEL: Record<ProjectStorageDocKind, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  report: "完了報告書",
};

export const QNAP_SYNC_STATUS_LABELS: Record<
  QnapSyncStatusV1,
  { icon: string; label: string }
> = {
  synced: { icon: "🟢", label: "同期済" },
  pending: { icon: "🟡", label: "未同期" },
  error: { icon: "🔴", label: "エラー" },
};

export function projectStorageRootDir(): string {
  return path.join(process.cwd(), "data", "project-storage");
}

export function projectStorageProjectDir(projectNo: string): string {
  const safe = projectNo.replace(/[/\\]/g, "-");
  return path.join(projectStorageRootDir(), safe);
}

function resolveAbsolutePdfPath(pdfPath: string): string {
  return path.join(process.cwd(), pdfPath.replace(/^\//, ""));
}

export function updateQnapSyncStatusV1(projectId: string, status: QnapSyncStatusV1): void {
  getDatabase()
    .prepare(
      `UPDATE business_projects SET qnap_sync_status = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(status, projectId);
}

function resolveStorageFileName(projectId: string, kind: ProjectStorageDocKind): string {
  const project = getBusinessProject(projectId);
  if (!project) return `${KIND_TO_DOC_LABEL[kind]}.pdf`;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  return buildProjectPdfFileNameForProject(
    kind as ProjectPdfKind,
    project,
    estimate ?? undefined
  );
}

export interface CreateProjectStorageFoldersResultV1 {
  projectId: string;
  projectNo: string;
  qnapFolderPath: string;
  localPath: string;
  folders: string[];
  created: boolean;
  provider: "mock";
}

function createFolders(projectId: string): CreateProjectStorageFoldersResultV1 {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  const projectNo = project.projectNo || projectId;
  const qnapFolderPath = project.qnapFolderPath || buildQnapFolderPathV1(projectNo);
  const localRoot = projectStorageProjectDir(projectNo);

  let created = false;
  if (!fs.existsSync(localRoot)) {
    fs.mkdirSync(localRoot, { recursive: true });
    created = true;
  }

  for (const sub of PROJECT_STORAGE_SUBFOLDERS) {
    const dir = path.join(localRoot, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created = true;
    }
  }

  if (!project.qnapFolderPath?.trim()) {
    getDatabase()
      .prepare(`UPDATE business_projects SET qnap_folder_path = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(qnapFolderPath, projectId);
  }

  return {
    projectId,
    projectNo,
    qnapFolderPath,
    localPath: localRoot,
    folders: [...PROJECT_STORAGE_SUBFOLDERS],
    created,
    provider: "mock",
  };
}

export interface ProjectStorageFileEntryV1 {
  kind: ProjectStorageDocKind;
  label: string;
  fileName: string;
  folder: string;
  relativePath: string;
  savedAt: string | null;
  sizeBytes: number | null;
  viewerKind: string;
  shareFileName: string;
  hasLocalPdf: boolean;
}

export interface ListProjectStorageResultV1 {
  projectId: string;
  projectNo: string;
  qnapFolderPath: string;
  qnapSyncStatus: QnapSyncStatusV1;
  qnapSyncLabel: string;
  qnapSyncIcon: string;
  folders: string[];
  files: ProjectStorageFileEntryV1[];
  provider: "mock";
}

function readFileEntry(
  projectId: string,
  kind: ProjectStorageDocKind,
  folder: string,
  filePath: string
): ProjectStorageFileEntryV1 | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const meta = getProjectPdfMeta(projectId, kind as ProjectPdfKind);
  return {
    kind,
    label: fileName,
    fileName,
    folder,
    relativePath: path.relative(projectStorageRootDir(), filePath).replace(/\\/g, "/"),
    savedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    viewerKind: KIND_TO_VIEWER[kind],
    shareFileName: fileName,
    hasLocalPdf: Boolean(meta?.localPath),
  };
}

function list(projectId: string): ListProjectStorageResultV1 {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  const projectNo = project.projectNo || projectId;
  const qnapFolderPath = project.qnapFolderPath || buildQnapFolderPathV1(projectNo);
  const localRoot = projectStorageProjectDir(projectNo);
  const status = (project.qnapSyncStatus || "pending") as QnapSyncStatusV1;
  const pres = QNAP_SYNC_STATUS_LABELS[status] ?? QNAP_SYNC_STATUS_LABELS.pending;

  const files: ProjectStorageFileEntryV1[] = [];
  for (const kind of Object.keys(KIND_TO_SUBFOLDER) as ProjectStorageDocKind[]) {
    const folder = KIND_TO_SUBFOLDER[kind];
    const dir = path.join(localRoot, folder);
    if (!fs.existsSync(dir)) continue;

    const expectedName = resolveStorageFileName(projectId, kind);
    const expectedPath = path.join(dir, expectedName);
    const entry =
      readFileEntry(projectId, kind, folder, expectedPath) ??
      (() => {
        const pdfs = fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(".pdf"))
          .sort((a, b) => {
            const sa = fs.statSync(path.join(dir, a)).mtimeMs;
            const sb = fs.statSync(path.join(dir, b)).mtimeMs;
            return sb - sa;
          });
        if (pdfs.length === 0) return null;
        return readFileEntry(projectId, kind, folder, path.join(dir, pdfs[0]!));
      })();
    if (entry) files.push(entry);
  }

  return {
    projectId,
    projectNo,
    qnapFolderPath,
    qnapSyncStatus: status,
    qnapSyncLabel: pres.label,
    qnapSyncIcon: pres.icon,
    folders: [...PROJECT_STORAGE_SUBFOLDERS],
    files,
    provider: "mock",
  };
}

export interface SaveProjectStorageDocumentResultV1 {
  projectId: string;
  kind: ProjectStorageDocKind;
  fileName: string;
  folder: string;
  savedPath: string;
  qnapSyncStatus: QnapSyncStatusV1;
  provider: "mock";
}

function saveDocument(
  projectId: string,
  kind: ProjectStorageDocKind,
  sourcePdfPath?: string
): SaveProjectStorageDocumentResultV1 {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  createFolders(projectId);

  let pdfPath = sourcePdfPath?.trim();
  if (!pdfPath) {
    const meta = getProjectPdfMeta(projectId, kind as ProjectPdfKind);
    if (!meta?.localPath) throw new Error(`No local PDF for kind: ${kind}`);
    pdfPath = meta.localPath;
  }

  const absSource = resolveAbsolutePdfPath(pdfPath);
  if (!fs.existsSync(absSource)) throw new Error(`PDF not found: ${pdfPath}`);

  const projectNo = project.projectNo || projectId;
  const folder = KIND_TO_SUBFOLDER[kind];
  const fileName = resolveStorageFileName(projectId, kind);
  const destDir = path.join(projectStorageProjectDir(projectNo), folder);
  fs.mkdirSync(destDir, { recursive: true });

  for (const existing of fs.readdirSync(destDir)) {
    if (existing.toLowerCase().endsWith(".pdf") && existing !== fileName) {
      try {
        fs.unlinkSync(path.join(destDir, existing));
      } catch {
        /* */
      }
    }
  }

  const destPath = path.join(destDir, fileName);
  fs.copyFileSync(absSource, destPath);
  updateQnapSyncStatusV1(projectId, "synced");

  return {
    projectId,
    kind,
    fileName,
    folder,
    savedPath: destPath,
    qnapSyncStatus: "synced",
    provider: "mock",
  };
}

function mirrorPdf(projectId: string, kind: ProjectStorageDocKind, pdfPath: string): void {
  if (!KIND_TO_SUBFOLDER[kind]) return;
  try {
    saveDocument(projectId, kind, pdfPath);
  } catch (e) {
    console.error("[mock-project-storage] mirror failed:", e);
    try {
      updateQnapSyncStatusV1(projectId, "error");
    } catch {
      /* */
    }
  }
}

export const mockProjectStorageProvider: ProjectStorageProvider = {
  kind: "mock",
  createFolders,
  list,
  saveDocument,
  mirrorPdf,
};
