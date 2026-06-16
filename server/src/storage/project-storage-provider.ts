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
  QnapSyncStatusV1,
  SaveProjectStorageDocumentResultV1,
} from "./mock-project-storage-provider.js";

export {
  PROJECT_STORAGE_SUBFOLDERS,
  QNAP_SYNC_STATUS_LABELS,
  projectStorageProjectDir,
  projectStorageRootDir,
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
