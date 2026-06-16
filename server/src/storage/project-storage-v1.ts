/**
 * 案件ストレージ v1 — provider 経由の公開 API
 */
import type { ProjectPdfKind } from "../projects/project-pdf-store.js";
import { addProjectTimelineEventV1 } from "../projects/project-timeline-v1-store.js";
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
  ProjectStorageFolderContentV1,
  ProjectStorageFolderFileV1,
  ProjectStorageFolderType,
  ProjectStorageDocumentSlotV1,
  ProjectStorageSaveStatusV1,
  UploadProjectStorageFileResultV1,
  QnapSyncStatusV1,
  SaveProjectStorageDocumentResultV1,
} from "./project-storage-provider.js";

export {
  FOLDER_TYPE_TO_SUBFOLDER,
  PROJECT_STORAGE_SUBFOLDERS,
  QNAP_SYNC_STATUS_LABELS,
  UPLOAD_FOLDER_TYPES,
  projectStorageProjectDir,
  projectStorageRootDir,
  resolveProjectStorageProviderKind,
  resolveProjectStorageFilePath,
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

export function uploadProjectStorageFileV1(
  projectId: string,
  folderType: import("./project-storage-provider.js").ProjectStorageFolderType,
  input: { fileName: string; fileBase64: string }
) {
  const result = getProjectStorageProvider().uploadFile(projectId, folderType, input);
  if (folderType === "photos") {
    addProjectTimelineEventV1({
      projectId,
      eventType: "photo_added",
      title: "写真追加",
      description: input.fileName,
    });
  } else if (folderType === "drawings") {
    addProjectTimelineEventV1({
      projectId,
      eventType: "drawing_added",
      title: "図面追加",
      description: input.fileName,
    });
  }
  return result;
}

/** PDF 保存時に project storage へ自動ミラー */
export function mirrorPdfToProjectStorageV1(
  projectId: string,
  kind: ProjectPdfKind,
  pdfPath: string
): void {
  getProjectStorageProvider().mirrorPdf(projectId, kind as ProjectStorageDocKind, pdfPath);
}
