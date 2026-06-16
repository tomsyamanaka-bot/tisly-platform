/**
 * 案件ストレージ provider — mock / qnap 切替
 *
 * PROJECT_STORAGE_PROVIDER=mock  （既定）
 * PROJECT_STORAGE_PROVIDER=qnap  （将来: 実 QNAP WebDAV 保存）
 */
import type {
  CreateProjectStorageFoldersResultV1,
  ListProjectStorageResultV1,
  ProjectStorageDocKind,
  SaveProjectStorageDocumentResultV1,
} from "./mock-project-storage-provider.js";
import { mockProjectStorageProvider } from "./mock-project-storage-provider.js";
import { qnapProjectStorageProvider } from "./qnap-project-storage-provider.js";

export type ProjectStorageProviderKind = "mock" | "qnap";

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
} from "./mock-project-storage-provider.js";

export {
  FOLDER_TYPE_TO_SUBFOLDER,
  PROJECT_STORAGE_SUBFOLDERS,
  QNAP_SYNC_STATUS_LABELS,
  UPLOAD_FOLDER_TYPES,
  projectStorageProjectDir,
  projectStorageRootDir,
  resolveProjectStorageFilePath,
} from "./mock-project-storage-provider.js";

export interface ProjectStorageProvider {
  readonly kind: ProjectStorageProviderKind;
  createFolders(projectId: string): CreateProjectStorageFoldersResultV1;
  list(projectId: string): ListProjectStorageResultV1;
  saveDocument(
    projectId: string,
    kind: ProjectStorageDocKind,
    sourcePdfPath?: string
  ): SaveProjectStorageDocumentResultV1;
  mirrorPdf(projectId: string, kind: ProjectStorageDocKind, pdfPath: string): void;
  uploadFile(
    projectId: string,
    folderType: import("./mock-project-storage-provider.js").ProjectStorageFolderType,
    input: { fileName: string; fileBase64: string }
  ): import("./mock-project-storage-provider.js").UploadProjectStorageFileResultV1;
}

export function resolveProjectStorageProviderKind(): ProjectStorageProviderKind {
  const raw = process.env.PROJECT_STORAGE_PROVIDER?.trim().toLowerCase();
  return raw === "qnap" ? "qnap" : "mock";
}

export function getProjectStorageProvider(): ProjectStorageProvider {
  return resolveProjectStorageProviderKind() === "qnap"
    ? qnapProjectStorageProvider
    : mockProjectStorageProvider;
}
