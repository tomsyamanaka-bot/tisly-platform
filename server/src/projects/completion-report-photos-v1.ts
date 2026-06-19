/**
 * 完了報告書 PDF v2 — 施工写真スロット連携
 */
import path from "path";
import { listProjectPhotoSlotsV1 } from "./project-automation-v1-store.js";
import type { CompletionReportPhotoV1 } from "./project-automation-types.js";
import { getStorageDocumentByIdV1 } from "../storage/storage-documents-v1-store.js";
import { listCompletionPhotosV1 } from "../estimate/completion-photos-store.js";
import type { PracticalCompletionReportPhoto } from "../estimate/practical-completion-report-template.js";

function relativePathFromProjectStorage(localPath: string, projectId: string): string | null {
  const normalized = localPath.replace(/\\/g, "/");
  const prefix = `data/project-storage/${projectId}/`;
  if (normalized.startsWith(prefix)) return normalized.slice(prefix.length);
  const m = normalized.match(/^data\/project-storage\/[^/]+\/(.+)$/);
  return m?.[1] ?? null;
}

/** ブラウザプレビュー / PDF HTML 用の画像 URL */
export function resolvePhotoSlotImageUrlV1(
  projectId: string,
  slot: { documentId: string | null; photoPath: string | null }
): string | null {
  if (slot.documentId) {
    const doc = getStorageDocumentByIdV1(slot.documentId);
    if (!doc?.localPath) return null;
    const lp = doc.localPath.replace(/\\/g, "/");
    if (lp.startsWith("/uploads/") || lp.startsWith("uploads/")) {
      return `/${lp.replace(/^\//, "")}`;
    }
    const rel = relativePathFromProjectStorage(lp, projectId);
    if (rel) {
      return `/api/project-storage/${encodeURIComponent(projectId)}/file?relativePath=${encodeURIComponent(rel)}`;
    }
    if (lp.startsWith("data/project-storage/")) return lp;
    return null;
  }
  if (slot.photoPath) {
    const pp = slot.photoPath.replace(/\\/g, "/");
    if (pp.startsWith("/uploads/") || pp.startsWith("uploads/")) {
      return `/${pp.replace(/^\//, "")}`;
    }
    return `/uploads/business/${projectId}/completion/${path.basename(pp)}`;
  }
  return null;
}

export function hasPhotoSlotsV1(projectId: string): boolean {
  return listProjectPhotoSlotsV1(projectId).length > 0;
}

export function getCompletionReportPhotosV1(projectId: string): CompletionReportPhotoV1[] {
  const photos = listProjectPhotoSlotsV1(projectId);
  return photos
    .map((slot, index) => {
      let fileName: string | null = null;
      let localPath: string | null = null;
      let qnapPath: string | null = null;
      let qnapStatus: string | null = null;
      if (slot.documentId) {
        const doc = getStorageDocumentByIdV1(slot.documentId);
        if (doc) {
          fileName = doc.fileName;
          localPath = doc.localPath;
          qnapPath = doc.qnapPath;
          qnapStatus = doc.status;
        }
      } else if (slot.photoPath) {
        fileName = path.basename(slot.photoPath);
        localPath = slot.photoPath;
      }
      const hasPhoto = Boolean(slot.documentId || slot.photoPath);
      return {
        photoSlotId: slot.id,
        photoSlotName: slot.label,
        photoOrder: slot.sortOrder ?? index,
        documentId: slot.documentId,
        fileName,
        localPath,
        qnapPath,
        qnapStatus,
        caption: slot.caption,
        hasPhoto,
        missing: !hasPhoto,
      };
    })
    .sort((a, b) => a.photoOrder - b.photoOrder);
}

/** 完了報告書 PDF 用写真（スロット優先、なければ従来 completion_photos） */
export function buildCompletionPhotosForPdfV1(
  businessProjectId: string
): PracticalCompletionReportPhoto[] {
  const slots = listProjectPhotoSlotsV1(businessProjectId);
  if (slots.length > 0) {
    return getCompletionReportPhotosV1(businessProjectId)
      .filter((p) => p.hasPhoto)
      .map((p, i) => {
        const slot = slots.find((s) => s.id === p.photoSlotId);
        const url = slot ? resolvePhotoSlotImageUrlV1(businessProjectId, slot) : null;
        const title = (p.caption?.trim() || p.photoSlotName || `写真${i + 1}`).trim();
        return { url: url ?? "", title };
      })
      .filter((p) => p.url);
  }
  return listCompletionPhotosV1(businessProjectId).map((p, i) => ({
    url: p.url,
    title: (p.title || "").trim() || `写真${i + 1}`,
  }));
}
