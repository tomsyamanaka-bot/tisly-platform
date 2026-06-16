/**
 * Mock project storage — server/data/project-storage/{案件No}/
 */
import fs from "fs";
import path from "path";
import { getBusinessProject, getEstimate } from "../business/business-store.js";
import { getDatabase } from "../db/database.js";
import {
  buildCompletionPhotosV1,
  buildReportPhotosV1,
} from "../estimate/estimate-v1-store.js";
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

export type ProjectStorageFolderType =
  | "survey"
  | "estimate"
  | "invoice"
  | "specification"
  | "completion"
  | "photos"
  | "drawings"
  | "others";

export type ProjectStorageSaveStatusV1 = "saved" | "unsaved" | "regenerable" | "error";

export type QnapSyncStatusV1 = "pending" | "synced" | "error";

export const FOLDER_TYPE_TO_SUBFOLDER: Record<ProjectStorageFolderType, string> = {
  survey: "01_現調",
  estimate: "02_見積",
  invoice: "03_請求",
  specification: "04_仕様書",
  completion: "05_完了報告",
  photos: "06_写真",
  drawings: "07_図面",
  others: "08_その他",
};

export const SUBFOLDER_TO_FOLDER_TYPE: Record<string, ProjectStorageFolderType> = Object.fromEntries(
  Object.entries(FOLDER_TYPE_TO_SUBFOLDER).map(([k, v]) => [v, k as ProjectStorageFolderType])
) as Record<string, ProjectStorageFolderType>;

export const UPLOAD_FOLDER_TYPES = new Set<ProjectStorageFolderType>([
  "photos",
  "drawings",
  "others",
]);

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
  synced: { icon: "🟢", label: "QNAP保存済" },
  pending: { icon: "🟡", label: "未保存" },
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

function resolveUploadUrlToPath(url: string): string | null {
  if (!url?.startsWith("/uploads/")) return null;
  return path.join(process.cwd(), url.replace(/^\//, ""));
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

function fileMediaKind(fileName: string): "pdf" | "image" | "other" {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "other";
}

function fileIcon(mediaKind: "pdf" | "image" | "other"): string {
  if (mediaKind === "image") return "🖼";
  return "📄";
}

function safeUploadFileName(raw: string): string {
  const base = path.basename(raw).replace(/[^\w\u3040-\u30ff\u4e00-\u9faf.\-]+/g, "_");
  return base || `upload_${Date.now()}.bin`;
}

function uniqueDestPath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = fileName;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}_${n}${ext}`;
    n += 1;
  }
  return path.join(dir, candidate);
}

function resolveDocSaveStatus(
  projectId: string,
  kind: ProjectStorageDocKind,
  stored: boolean,
  projectSyncStatus: QnapSyncStatusV1
): { saveStatus: ProjectStorageSaveStatusV1; saveStatusIcon: string; saveStatusLabel: string } {
  if (stored) {
    return { saveStatus: "saved", saveStatusIcon: "✅", saveStatusLabel: "作成済" };
  }
  const meta = getProjectPdfMeta(projectId, kind as ProjectPdfKind);
  if (projectSyncStatus === "error" && meta?.localPath) {
    return { saveStatus: "error", saveStatusIcon: "🔴", saveStatusLabel: "エラー" };
  }
  if (meta?.localPath) {
    return { saveStatus: "regenerable", saveStatusIcon: "🔄", saveStatusLabel: "更新あり" };
  }
  return { saveStatus: "unsaved", saveStatusIcon: "🟡", saveStatusLabel: "未保存" };
}

function listFilesInFolder(
  localRoot: string,
  folderName: string
): ProjectStorageFolderFileV1[] {
  const dir = path.join(localRoot, folderName);
  if (!fs.existsSync(dir)) return [];

  const items: ProjectStorageFolderFileV1[] = [];

  function walk(currentDir: string, relInsideFolder: string): void {
    for (const name of fs.readdirSync(currentDir).sort((a, b) => a.localeCompare(b, "ja"))) {
      const abs = path.join(currentDir, name);
      const rel = relInsideFolder ? `${relInsideFolder}/${name}` : name;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      const mediaKind = fileMediaKind(name);
      items.push({
        fileName: rel,
        displayName: rel,
        folder: folderName,
        relativePath: path
          .relative(projectStorageRootDir(), abs)
          .replace(/\\/g, "/"),
        mediaKind,
        icon: fileIcon(mediaKind),
        savedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }

  walk(dir, "");
  return items;
}

function mirrorSpecificationPhotos(projectId: string, projectNo: string): void {
  const photos = buildReportPhotosV1(projectId);
  const destDir = path.join(projectStorageProjectDir(projectNo), "06_写真", "仕様書");
  fs.mkdirSync(destDir, { recursive: true });
  for (const existing of fs.readdirSync(destDir)) {
    if (existing.startsWith("仕様書写真_")) {
      try {
        fs.unlinkSync(path.join(destDir, existing));
      } catch {
        /* */
      }
    }
  }
  photos.forEach((p, i) => {
    const src = resolveUploadUrlToPath(p.url);
    if (!src || !fs.existsSync(src)) return;
    const ext = path.extname(src) || ".jpg";
    const destName = `仕様書写真_${String(i + 1).padStart(3, "0")}${ext}`;
    fs.copyFileSync(src, path.join(destDir, destName));
  });
}

function mirrorCompletionPhotos(projectId: string, projectNo: string): void {
  const photos = buildCompletionPhotosV1(projectId);
  const destDir = path.join(projectStorageProjectDir(projectNo), "06_写真", "完了報告");
  fs.mkdirSync(destDir, { recursive: true });
  for (const existing of fs.readdirSync(destDir)) {
    if (existing.startsWith("完了写真_")) {
      try {
        fs.unlinkSync(path.join(destDir, existing));
      } catch {
        /* */
      }
    }
  }
  photos.forEach((p, i) => {
    const src = resolveUploadUrlToPath(p.url);
    if (!src || !fs.existsSync(src)) return;
    const ext = path.extname(src) || ".jpg";
    const destName = `完了写真_${String(i + 1).padStart(3, "0")}${ext}`;
    fs.copyFileSync(src, path.join(destDir, destName));
  });
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
  saveStatus: ProjectStorageSaveStatusV1;
  saveStatusIcon: string;
  saveStatusLabel: string;
}

export interface ProjectStorageDocumentSlotV1 {
  kind: ProjectStorageDocKind;
  docLabel: string;
  fileName: string | null;
  folder: string;
  viewerKind: string;
  pdfKind: string;
  saveStatus: ProjectStorageSaveStatusV1;
  saveStatusIcon: string;
  saveStatusLabel: string;
  savedAt: string | null;
  hasLocalPdf: boolean;
}

export interface ProjectStorageFolderFileV1 {
  fileName: string;
  displayName: string;
  folder: string;
  relativePath: string;
  mediaKind: "pdf" | "image" | "other";
  icon: string;
  savedAt: string;
  sizeBytes: number;
}

export interface ProjectStorageFolderContentV1 {
  folder: string;
  folderType: ProjectStorageFolderType;
  files: ProjectStorageFolderFileV1[];
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
  documents: ProjectStorageDocumentSlotV1[];
  folderContents: ProjectStorageFolderContentV1[];
  provider: "mock";
}

function readFileEntry(
  projectId: string,
  kind: ProjectStorageDocKind,
  folder: string,
  filePath: string,
  projectSyncStatus: QnapSyncStatusV1
): ProjectStorageFileEntryV1 | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const meta = getProjectPdfMeta(projectId, kind as ProjectPdfKind);
  const save = resolveDocSaveStatus(projectId, kind, true, projectSyncStatus);
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
    saveStatus: save.saveStatus,
    saveStatusIcon: save.saveStatusIcon,
    saveStatusLabel: save.saveStatusLabel,
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
  const documents: ProjectStorageDocumentSlotV1[] = [];

  for (const kind of Object.keys(KIND_TO_SUBFOLDER) as ProjectStorageDocKind[]) {
    const folder = KIND_TO_SUBFOLDER[kind];
    const dir = path.join(localRoot, folder);
    let entry: ProjectStorageFileEntryV1 | null = null;
    if (fs.existsSync(dir)) {
      const expectedName = resolveStorageFileName(projectId, kind);
      const expectedPath = path.join(dir, expectedName);
      entry =
        readFileEntry(projectId, kind, folder, expectedPath, status) ??
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
          return readFileEntry(projectId, kind, folder, path.join(dir, pdfs[0]!), status);
        })();
      if (entry) {
        files.push(entry);
      }
    }

    const meta = getProjectPdfMeta(projectId, kind as ProjectPdfKind);
    const save = resolveDocSaveStatus(projectId, kind, Boolean(entry), status);
    documents.push({
      kind,
      docLabel: KIND_TO_DOC_LABEL[kind],
      fileName: entry?.fileName ?? null,
      folder,
      viewerKind: KIND_TO_VIEWER[kind],
      pdfKind: kind === "report" ? "report" : kind,
      saveStatus: save.saveStatus,
      saveStatusIcon: save.saveStatusIcon,
      saveStatusLabel: save.saveStatusLabel,
      savedAt: entry?.savedAt ?? null,
      hasLocalPdf: Boolean(meta?.localPath),
    });
  }

  const folderContents: ProjectStorageFolderContentV1[] = PROJECT_STORAGE_SUBFOLDERS.map(
    (folderName) => ({
      folder: folderName,
      folderType: SUBFOLDER_TO_FOLDER_TYPE[folderName]!,
      files: listFilesInFolder(localRoot, folderName),
    })
  );

  return {
    projectId,
    projectNo,
    qnapFolderPath,
    qnapSyncStatus: status,
    qnapSyncLabel: pres.label,
    qnapSyncIcon: pres.icon,
    folders: [...PROJECT_STORAGE_SUBFOLDERS],
    files,
    documents,
    folderContents,
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

  if (kind === "specification") {
    mirrorSpecificationPhotos(projectId, projectNo);
  } else if (kind === "report") {
    mirrorCompletionPhotos(projectId, projectNo);
  }

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

export interface UploadProjectStorageFileResultV1 {
  projectId: string;
  folderType: ProjectStorageFolderType;
  folder: string;
  fileName: string;
  relativePath: string;
  savedPath: string;
  sizeBytes: number;
  provider: "mock";
}

function uploadFile(
  projectId: string,
  folderType: ProjectStorageFolderType,
  input: { fileName: string; fileBase64: string }
): UploadProjectStorageFileResultV1 {
  if (!UPLOAD_FOLDER_TYPES.has(folderType)) {
    throw new Error("folderType must be photos|drawings|others");
  }
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  const rawB64 = input.fileBase64?.trim();
  if (!rawB64) throw new Error("fileBase64 is required");

  const base64 = rawB64.includes(",") ? rawB64.split(",").pop()! : rawB64;
  const buf = Buffer.from(base64, "base64");
  if (!buf.length) throw new Error("empty file");

  createFolders(projectId);

  const projectNo = project.projectNo || projectId;
  const folder = FOLDER_TYPE_TO_SUBFOLDER[folderType];
  const destDir = path.join(projectStorageProjectDir(projectNo), folder);
  fs.mkdirSync(destDir, { recursive: true });

  const safeName = safeUploadFileName(input.fileName || "upload.bin");
  const destPath = uniqueDestPath(destDir, safeName);
  fs.writeFileSync(destPath, buf);
  updateQnapSyncStatusV1(projectId, "synced");

  const stat = fs.statSync(destPath);
  return {
    projectId,
    folderType,
    folder,
    fileName: path.basename(destPath),
    relativePath: path.relative(projectStorageRootDir(), destPath).replace(/\\/g, "/"),
    savedPath: destPath,
    sizeBytes: stat.size,
    provider: "mock",
  };
}

export function resolveProjectStorageFilePath(
  projectId: string,
  relativePath: string
): string | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;
  const projectNo = project.projectNo || projectId;
  const root = projectStorageRootDir();
  const abs = path.resolve(root, relativePath.replace(/\\/g, "/"));
  const projectDir = path.resolve(projectStorageProjectDir(projectNo));
  if (!abs.startsWith(projectDir + path.sep) && abs !== projectDir) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

export const mockProjectStorageProvider: ProjectStorageProvider = {
  kind: "mock",
  createFolders,
  list,
  saveDocument,
  mirrorPdf,
  uploadFile,
};
