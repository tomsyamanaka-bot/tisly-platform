/**
 * QNAP連携 v1 — Mock Storage（server/data/project-storage/）
 *
 * 案件フォルダ自動生成 + PDF 種別ごとの保存先マッピング。
 * 実 QNAP 接続は将来フェーズ。現状はローカル mock が正。
 */
import fs from "fs";
import path from "path";
import { getBusinessProject } from "../business/business-store.js";
import { getDatabase } from "../db/database.js";
import { buildQnapFolderPathV1 } from "../projects/project-id-v1.js";
import { getProjectPdfMeta } from "../projects/project-pdf-qnap-store.js";
import type { ProjectPdfKind } from "../projects/project-pdf-store.js";

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

const KIND_TO_SUBFOLDER: Record<ProjectStorageDocKind, string> = {
  estimate: "02_見積",
  invoice: "03_請求",
  specification: "04_仕様書",
  report: "05_完了報告",
};

const KIND_TO_DISPLAY_LABEL: Record<ProjectStorageDocKind, string> = {
  estimate: "見積書.pdf",
  invoice: "請求書.pdf",
  specification: "仕様書.pdf",
  report: "完了報告書.pdf",
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
    .prepare(`UPDATE business_projects SET qnap_sync_status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, projectId);
}

export interface CreateProjectStorageFoldersResultV1 {
  projectId: string;
  projectNo: string;
  qnapFolderPath: string;
  localPath: string;
  folders: string[];
  created: boolean;
}

export function createProjectStorageFoldersV1(projectId: string): CreateProjectStorageFoldersResultV1 {
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
}

function readFileEntry(
  kind: ProjectStorageDocKind,
  folder: string,
  filePath: string
): ProjectStorageFileEntryV1 | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    kind,
    label: KIND_TO_DISPLAY_LABEL[kind],
    fileName: path.basename(filePath),
    folder,
    relativePath: path.relative(projectStorageRootDir(), filePath).replace(/\\/g, "/"),
    savedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
  };
}

export function listProjectStorageV1(projectId: string): ListProjectStorageResultV1 {
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
    const canonical = path.join(dir, KIND_TO_DISPLAY_LABEL[kind]);
    const entry = readFileEntry(kind, folder, canonical);
    if (entry) {
      files.push(entry);
      continue;
    }
    const pdfs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
    if (pdfs.length > 0) {
      const alt = readFileEntry(kind, folder, path.join(dir, pdfs[0]!));
      if (alt) files.push(alt);
    }
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
  };
}

export interface SaveProjectStorageDocumentResultV1 {
  projectId: string;
  kind: ProjectStorageDocKind;
  fileName: string;
  folder: string;
  savedPath: string;
  qnapSyncStatus: QnapSyncStatusV1;
}

export function saveProjectStorageDocumentV1(
  projectId: string,
  kind: ProjectStorageDocKind,
  sourcePdfPath?: string
): SaveProjectStorageDocumentResultV1 {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  createProjectStorageFoldersV1(projectId);

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
  const fileName = KIND_TO_DISPLAY_LABEL[kind];
  const destDir = path.join(projectStorageProjectDir(projectNo), folder);
  fs.mkdirSync(destDir, { recursive: true });
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
  };
}

/** PDF 保存時に mock storage へ自動ミラー */
export function mirrorPdfToProjectStorageV1(
  projectId: string,
  kind: ProjectPdfKind,
  pdfPath: string
): void {
  const mapped = kind as ProjectStorageDocKind;
  if (!KIND_TO_SUBFOLDER[mapped]) return;
  try {
    saveProjectStorageDocumentV1(projectId, mapped, pdfPath);
  } catch (e) {
    console.error("[project-storage-v1] mirror failed:", e);
    try {
      updateQnapSyncStatusV1(projectId, "error");
    } catch {
      /* */
    }
  }
}
