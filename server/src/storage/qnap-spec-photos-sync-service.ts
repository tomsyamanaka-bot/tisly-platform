/**
 * 仕様書写真 — QNAP 一括同期（spec_project_photos_v1 × storage_documents_v1）
 */
import { listSpecProjectPhotoSlotsV1 } from "../projects/spec-photo-slots-v1-store.js";
import {
  getStorageDocumentByIdV1,
  type StorageDocumentV1,
} from "./storage-documents-v1-store.js";
import { syncStorageDocumentToQnapV1 } from "./qnap-storage-v1-service.js";

export interface SpecPhotoQnapSyncResultV1 {
  projectId: string;
  synced: string[];
  skipped: string[];
  failed: Array<{ documentId: string; slotId: string; error: string }>;
}

function isSyncTargetDoc(doc: StorageDocumentV1 | null | undefined): boolean {
  if (!doc) return false;
  if (doc.sourceType !== "specification" && doc.documentType !== "photo") return false;
  return doc.status === "qnap_pending" || doc.status === "qnap_failed";
}

/** 案件の仕様書写真（スロット紐付け documentId）を QNAP 同期 */
export async function syncSpecPhotosToQnapV1(projectId: string): Promise<SpecPhotoQnapSyncResultV1> {
  const slots = listSpecProjectPhotoSlotsV1(projectId);
  const synced: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ documentId: string; slotId: string; error: string }> = [];
  const seen = new Set<string>();

  for (const slot of slots) {
    if (!slot.documentId) continue;
    if (seen.has(slot.documentId)) continue;
    seen.add(slot.documentId);

    const doc = getStorageDocumentByIdV1(slot.documentId);
    if (!isSyncTargetDoc(doc)) {
      if (doc?.status === "qnap_synced") skipped.push(slot.documentId);
      continue;
    }

    const result = await syncStorageDocumentToQnapV1(slot.documentId);
    if (result.ok) {
      synced.push(slot.documentId);
    } else if (result.status === "qnap_synced") {
      skipped.push(slot.documentId);
    } else {
      failed.push({
        documentId: slot.documentId,
        slotId: slot.id,
        error: result.errorMessage ?? "sync failed",
      });
    }
  }

  return { projectId, synced, skipped, failed };
}
