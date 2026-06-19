/**
 * 仕様書 PDF v2 — 仕様書写真スロット連携
 */
import path from "path";
import { resolvePhotoSlotImageUrlV1 } from "./completion-report-photos-v1.js";
import type { SpecificationPhotoV1 } from "./project-automation-types.js";
import {
  getStorageDocumentByIdV1,
  storageStatusPresentation,
} from "../storage/storage-documents-v1-store.js";
import { isQnapPdfBackupConfigured } from "../projects/project-pdf-qnap-store.js";
import { getStorageSettingsV1 } from "../storage/storage-settings-store.js";
import { listSpecProjectPhotoSlotsV1, linkSpecProjectPhotoSlotV1 } from "./spec-photo-slots-v1-store.js";
import type { PracticalCompletionReportPhoto } from "../estimate/practical-completion-report-template.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import { getBusinessProject } from "../business/business-store.js";

function qnapConfigured(): boolean {
  const settings = getStorageSettingsV1();
  return Boolean(settings.qnapBackupEnabled && isQnapPdfBackupConfigured());
}

export function hasSpecPhotoSlotsV1(projectId: string): boolean {
  return listSpecProjectPhotoSlotsV1(projectId).length > 0;
}

export function getSpecificationPhotosV1(projectId: string): SpecificationPhotoV1[] {
  const photos = listSpecProjectPhotoSlotsV1(projectId, { activeOnly: true });
  const qnapOn = qnapConfigured();
  return photos
    .map((slot, index) => {
      let fileName: string | null = null;
      let localPath: string | null = null;
      let qnapPath: string | null = null;
      let qnapStatus: string | null = null;
      let qnapStatusLabel: string | null = null;
      let qnapStatusIcon: string | null = null;
      if (slot.documentId) {
        const doc = getStorageDocumentByIdV1(slot.documentId);
        if (doc) {
          fileName = doc.fileName;
          localPath = doc.localPath;
          qnapPath = doc.qnapPath;
          qnapStatus = doc.status;
          const pres = storageStatusPresentation(doc.status, qnapOn);
          qnapStatusLabel = pres.label;
          qnapStatusIcon = pres.icon;
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
        qnapStatusLabel,
        qnapStatusIcon,
        caption: slot.caption,
        required: slot.required,
        active: slot.active,
        hasPhoto,
        missing: !hasPhoto,
      };
    })
    .sort((a, b) => a.photoOrder - b.photoOrder);
}

function legacySurveyPhotosForPdfV1(businessProjectId: string): PracticalCompletionReportPhoto[] {
  const project = getBusinessProject(businessProjectId);
  if (!project) return [];
  const raw = project.surveyProjectId
    ? listSurveyPhotosV1(project.surveyProjectId)
        .filter((p) => !p.photoPath.startsWith("_memo:") && p.url)
        .map((p) => ({ url: p.url, title: p.title ?? p.comment ?? "" }))
    : (project.surveyPhotos || [])
        .filter((p) => p.urlPath)
        .map((p) => ({ url: p.urlPath, title: p.caption ?? "" }));
  return raw.map((p, i) => ({
    url: p.url,
    title: p.title.trim() || `写真${i + 1}`,
  }));
}

/** 仕様書 PDF 用写真（スロット優先、なければ従来 survey_photos） */
export function buildSpecificationPhotosForPdfV1(
  businessProjectId: string
): PracticalCompletionReportPhoto[] {
  const slots = listSpecProjectPhotoSlotsV1(businessProjectId, { activeOnly: true });
  if (slots.length > 0) {
    return getSpecificationPhotosV1(businessProjectId)
      .filter((p) => p.hasPhoto)
      .map((p, i) => {
        const slot = slots.find((s) => s.id === p.photoSlotId);
        const url = slot ? resolvePhotoSlotImageUrlV1(businessProjectId, slot) : null;
        const title = (p.caption?.trim() || p.photoSlotName || `写真${i + 1}`).trim();
        return { url: url ?? "", title };
      })
      .filter((p) => p.url);
  }
  return legacySurveyPhotosForPdfV1(businessProjectId);
}

export function linkSurveyDrawingBackgroundToSpecSlotV1(
  businessProjectId: string,
  specPhotoSlotId: string,
  backgroundImagePath: string
): boolean {
  const relPath = backgroundImagePath.replace(/\\/g, "/");
  const updated = linkSpecProjectPhotoSlotV1(businessProjectId, specPhotoSlotId, {
    photoPath: relPath,
  });
  return Boolean(updated);
}
