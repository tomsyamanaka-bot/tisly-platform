/**
 * QNAP project storage provider — 将来フェーズ用スタブ
 *
 * PROJECT_STORAGE_PROVIDER=qnap で有効化予定。
 * 現時点では mock を使用してください。
 */
import type { ProjectStorageProvider } from "./project-storage-provider.js";
import type {
  CreateProjectStorageFoldersResultV1,
  ListProjectStorageResultV1,
  ProjectStorageDocKind,
  SaveProjectStorageDocumentResultV1,
} from "./mock-project-storage-provider.js";

const NOT_READY =
  "QNAP project storage provider is not implemented yet. Use PROJECT_STORAGE_PROVIDER=mock";

function notReady(): never {
  throw new Error(NOT_READY);
}

export const qnapProjectStorageProvider: ProjectStorageProvider = {
  kind: "qnap",
  createFolders(_projectId: string): CreateProjectStorageFoldersResultV1 {
    notReady();
  },
  list(_projectId: string): ListProjectStorageResultV1 {
    notReady();
  },
  saveDocument(
    _projectId: string,
    _kind: ProjectStorageDocKind,
    _sourcePdfPath?: string
  ): SaveProjectStorageDocumentResultV1 {
    notReady();
  },
  mirrorPdf(_projectId: string, _kind: ProjectStorageDocKind, _pdfPath: string): void {
    notReady();
  },
};
