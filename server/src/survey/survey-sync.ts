import { getDatabase } from "../db/database.js";
import {
  getSurveyProject,
  saveSurveyPhoto,
  saveSurveyDrawing,
  saveSurveyChecklist,
  updateSurveyProject,
  isValidSurveyPhotoType,
} from "./survey-store.js";

export interface SurveySyncItem {
  type: "photo" | "memo" | "checklist" | "drawing" | "gps";
  photoType?: string;
  imageBase64?: string;
  fileName?: string;
  mimeType?: string;
  checklist?: Record<string, unknown>;
  notes?: string;
  gpsLat?: number;
  gpsLng?: number;
  clientId?: string;
}

export interface SurveySyncBatch {
  projectId: string;
  items: SurveySyncItem[];
}

function saveSurveyMemo(projectId: string, notes: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO survey_project_notes (project_id, notes, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`
    )
    .run(projectId, notes);
}

export function processSurveySync(batch: SurveySyncBatch, uploadedBy?: string): {
  projectId: string;
  applied: number;
  failed: Array<{ index: number; error: string }>;
} {
  const project = getSurveyProject(batch.projectId);
  if (!project) throw new Error("project not found");

  const failed: Array<{ index: number; error: string }> = [];
  let applied = 0;

  for (let i = 0; i < batch.items.length; i++) {
    const item = batch.items[i];
    try {
      switch (item.type) {
        case "photo": {
          if (!item.imageBase64 || !item.photoType) throw new Error("photo fields missing");
          const pt = isValidSurveyPhotoType(item.photoType) ? item.photoType : "other";
          saveSurveyPhoto({
            projectId: batch.projectId,
            photoType: pt,
            imageBase64: item.imageBase64,
            fileName: item.fileName,
            uploadedBy,
          });
          break;
        }
        case "drawing": {
          if (!item.imageBase64) throw new Error("drawing image missing");
          saveSurveyDrawing({
            projectId: batch.projectId,
            imageBase64: item.imageBase64,
            fileName: item.fileName,
            mimeType: item.mimeType,
            uploadedBy,
          });
          break;
        }
        case "checklist": {
          if (!item.checklist) throw new Error("checklist missing");
          saveSurveyChecklist(batch.projectId, item.checklist);
          break;
        }
        case "memo": {
          if (item.notes) saveSurveyMemo(batch.projectId, item.notes);
          break;
        }
        case "gps": {
          updateSurveyProject(batch.projectId, {
            gpsLat: item.gpsLat,
            gpsLng: item.gpsLng,
          });
          break;
        }
        default:
          throw new Error("unknown sync type");
      }
      applied++;
    } catch (e) {
      failed.push({ index: i, error: String(e) });
    }
  }

  return { projectId: batch.projectId, applied, failed };
}
