/**
 * 案件ストレージ v1 — provider 経由の公開 API
 */
import type { ProjectPdfKind } from "../projects/project-pdf-store.js";
import {
  getProjectStorageProvider,
  type ProjectStorageDocKind,
  type QnapSyncStatusV1,
} from "./project-storage-provider.js";

export type {
  CreateProjectStorageFoldersResultV1,
  ListProjectStorageResultV1,
  ProjectStorageDocKind,
  ProjectStorageFileEntryV1,
  QnapSyncStatusV1,
  SaveProjectStorageDocumentResultV1,
} from "./project-storage-provider.js";

export {
  PROJECT_STORAGE_SUBFOLDERS,
  QNAP_SYNC_STATUS_LABELS,
  projectStorageProjectDir,
  projectStorageRootDir,
  resolveProjectStorageProviderKind,
} from "./project-storage-provider.js";

export { updateQnapSyncStatusV1 } from "./mock-project-storage-provider.js";

export function createProjectStorageFoldersV1(projectId: string) {
  return getProjectStorageProvider().createFolders(projectId);
}

export function listProjectStorageV1(projectId: string) {
  return getProjectStorageProvider().list(projectId);
}

export function saveProjectStorageDocumentV1(
  projectId: string,
  kind: ProjectStorageDocKind,
  sourcePdfPath?: string
) {
  return getProjectStorageProvider().saveDocument(projectId, kind, sourcePdfPath);
}

/** PDF 保存時に project storage へ自動ミラー */
export function mirrorPdfToProjectStorageV1(
  projectId: string,
  kind: ProjectPdfKind,
  pdfPath: string
): void {
  getProjectStorageProvider().mirrorPdf(projectId, kind as ProjectStorageDocKind, pdfPath);
}
