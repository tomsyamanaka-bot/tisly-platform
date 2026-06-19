/**
 * QNAP 日次整合チェック — 仕様書写真スロット × storage_documents_v1
 */
import { getDatabase } from "../db/database.js";
import { listSpecProjectPhotoSlotsV1 } from "../projects/spec-photo-slots-v1-store.js";
import {
  getStorageDocumentByIdV1,
  storageStatusPresentation,
} from "./storage-documents-v1-store.js";
import { isQnapPdfBackupConfigured } from "../projects/project-pdf-qnap-store.js";
import { getStorageSettingsV1 } from "./storage-settings-store.js";

export interface QnapSpecPhotoIntegrityItemV1 {
  projectId: string;
  slotId: string;
  slotLabel: string;
  documentId: string | null;
  linked: boolean;
  sourceTypeOk: boolean;
  qnapStatus: string | null;
  qnapStatusLabel: string;
  qnapStatusIcon: string;
  issue: string | null;
}

export interface QnapSpecPhotoIntegrityReportV1 {
  checkedAt: string;
  qnapBackupEnabled: boolean;
  slotCount: number;
  shotCount: number;
  linkedCount: number;
  mismatchCount: number;
  orphanDocumentCount: number;
  message: string;
  items: QnapSpecPhotoIntegrityItemV1[];
  orphanDocuments: Array<{
    id: string;
    projectId: string;
    fileName: string;
    qnapStatusLabel: string;
    qnapStatusIcon: string;
  }>;
}

function qnapOn(): boolean {
  const settings = getStorageSettingsV1();
  return Boolean(settings.qnapBackupEnabled && isQnapPdfBackupConfigured());
}

export function runQnapSpecPhotosIntegrityCheckV1(
  projectId?: string
): QnapSpecPhotoIntegrityReportV1 {
  const qnapBackupEnabled = qnapOn();
  const db = getDatabase();
  const projectIds = projectId
    ? [projectId]
    : (
        db
          .prepare(`SELECT DISTINCT project_id FROM spec_project_photos_v1`)
          .all() as Array<{ project_id: string }>
      ).map((r) => r.project_id);

  const items: QnapSpecPhotoIntegrityItemV1[] = [];
  let shotCount = 0;
  let linkedCount = 0;

  for (const pid of projectIds) {
    const slots = listSpecProjectPhotoSlotsV1(pid, { activeOnly: true });
    for (const slot of slots) {
      if (!slot.shot) continue;
      shotCount += 1;
      let linked = false;
      let sourceTypeOk = false;
      let qnapStatus: string | null = null;
      let qnapStatusLabel = "—";
      let qnapStatusIcon = "🟠";
      let issue: string | null = null;

      if (slot.documentId) {
        const doc = getStorageDocumentByIdV1(slot.documentId);
        if (doc) {
          linked = true;
          linkedCount += 1;
          sourceTypeOk = doc.sourceType === "specification";
          qnapStatus = doc.status;
          const pres = storageStatusPresentation(doc.status, qnapBackupEnabled);
          qnapStatusLabel = pres.label;
          qnapStatusIcon = pres.icon;
          if (!sourceTypeOk) {
            issue = `sourceType=${doc.sourceType}（specification 推奨）`;
          } else if (qnapBackupEnabled && doc.status !== "qnap_synced") {
            issue = pres.label;
          }
        } else {
          issue = "document_id が storage_documents_v1 に存在しません";
        }
      } else if (slot.photoPath) {
        linked = true;
        linkedCount += 1;
        qnapStatusLabel = "ローカルのみ";
        qnapStatusIcon = "🟠";
        issue = "図面等のローカルパス（QNAP未連携）";
      } else {
        issue = "撮影済みだが紐付けなし";
      }

      if (issue || !linked) {
        items.push({
          projectId: pid,
          slotId: slot.id,
          slotLabel: slot.label,
          documentId: slot.documentId,
          linked,
          sourceTypeOk,
          qnapStatus,
          qnapStatusLabel,
          qnapStatusIcon,
          issue,
        });
      }
    }
  }

  const orphanClause = projectId ? `AND project_id = ?` : "";
  const orphanParams = projectId ? [projectId] : [];
  const orphanRows = db
    .prepare(
      `SELECT id, project_id, file_name, status, source_type FROM storage_documents_v1
       WHERE document_type = 'photo' AND source_type = 'specification'
       AND id NOT IN (SELECT document_id FROM spec_project_photos_v1 WHERE document_id IS NOT NULL)
       ${orphanClause}`
    )
    .all(...orphanParams) as Array<Record<string, unknown>>;

  const orphanDocuments = orphanRows.map((r) => {
    const status = String(r.status ?? "qnap_pending");
    const pres = storageStatusPresentation(status as "qnap_pending", qnapBackupEnabled);
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      fileName: String(r.file_name ?? ""),
      qnapStatusLabel: pres.label,
      qnapStatusIcon: pres.icon,
    };
  });

  const mismatchCount = items.length + orphanDocuments.length;
  let message = "仕様書写真の整合性 OK";
  if (mismatchCount > 0) {
    message = `仕様書写真: 要確認 ${mismatchCount}件（スロット ${items.length} / 未紐付け ${orphanDocuments.length}）`;
  } else if (!qnapBackupEnabled) {
    message = "QNAPバックアップ未設定";
  }

  return {
    checkedAt: new Date().toISOString(),
    qnapBackupEnabled,
    slotCount: projectIds.reduce(
      (n, pid) => n + listSpecProjectPhotoSlotsV1(pid, { activeOnly: true }).length,
      0
    ),
    shotCount,
    linkedCount,
    mismatchCount,
    orphanDocumentCount: orphanDocuments.length,
    message,
    items: items.slice(0, 100),
    orphanDocuments: orphanDocuments.slice(0, 50),
  };
}
