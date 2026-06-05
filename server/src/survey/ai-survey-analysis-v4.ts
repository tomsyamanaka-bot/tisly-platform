import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  getSurveyChecklist,
  getSurveyProject,
  listSurveyDrawings,
  listSurveyPhotos,
} from "./survey-store.js";
import { listSurveyAudio } from "./survey-field-media.js";

export interface SurveyAnalysisV4Result {
  id: string;
  projectId: string;
  cameraCount: number;
  espCount: number;
  lanDistanceM: number;
  poeCount: number;
  hasPanel: boolean;
  crewCount: number;
  manHours: number;
  checklist: string[];
  confidence: number;
  createdAt: string;
}

function countByPhotoType(photos: Array<{ photoType: string }>, types: string[]): number {
  return photos.filter((p) => types.includes(p.photoType)).length;
}

function checklistChecked(
  checklist: Record<string, unknown>,
  key: string
): boolean {
  const item = checklist[key];
  if (!item || typeof item !== "object") return false;
  return Boolean((item as { checked?: boolean }).checked);
}

export function runSurveyAnalysisV4(projectId: string): SurveyAnalysisV4Result {
  const project = getSurveyProject(projectId);
  if (!project) throw new Error("project not found");

  const photos = listSurveyPhotos(projectId);
  const drawings = listSurveyDrawings(projectId);
  const audio = listSurveyAudio(projectId);
  const checklist = getSurveyChecklist(projectId);

  const cameraPhotos = countByPhotoType(photos, ["camera", "outside", "route"]);
  const sensorPhotos = countByPhotoType(photos, ["sensor", "inside"]);
  const panelPhotos = countByPhotoType(photos, ["panel", "electrical"]);
  const networkPhotos = countByPhotoType(photos, ["network", "route"]);

  const cameraCount = Math.max(2, cameraPhotos, checklistChecked(checklist, "camera") ? 4 : 0);
  const espCount = Math.max(1, Math.ceil((cameraCount + sensorPhotos) / 4));
  const lanDistanceM = Math.max(20, networkPhotos * 15 + drawings.length * 25);
  const poeCount = cameraCount + Math.ceil(sensorPhotos / 2);
  const hasPanel = panelPhotos > 0 || checklistChecked(checklist, "panel");
  const crewCount = lanDistanceM > 60 || cameraCount > 6 ? 2 : 1;
  const manHours = crewCount * (4 + Math.ceil(cameraCount / 2) + (hasPanel ? 2 : 0));

  const checklistNotes = [
    photos.length > 0 ? `写真 ${photos.length} 枚` : "写真未登録",
    drawings.length > 0 ? `図面 ${drawings.length} 件` : "図面未登録",
    audio.length > 0 ? `音声メモ ${audio.length} 件` : "音声メモなし",
    hasPanel ? "分電盤あり" : "分電盤要確認",
    `LAN 推定 ${lanDistanceM}m / PoE ${poeCount} 本`,
  ];

  const confidence = Math.min(
    0.95,
    0.45 +
      photos.length * 0.03 +
      drawings.length * 0.08 +
      (checklistChecked(checklist, "line") ? 0.05 : 0) +
      (checklistChecked(checklist, "wifi") ? 0.05 : 0)
  );

  const id = `SA4-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const result = {
    cameraCount,
    espCount,
    lanDistanceM,
    poeCount,
    hasPanel,
    crewCount,
    manHours,
    checklist: checklistNotes,
    confidence,
  };

  getDatabase()
    .prepare(
      `INSERT INTO survey_analysis_v4 (id, project_id, result_json, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, projectId, JSON.stringify(result), now);

  if (project.status === "draft" || project.status === "active") {
    getDatabase()
      .prepare(`UPDATE survey_projects SET status = 'completed', updated_at = ? WHERE project_id = ?`)
      .run(now, projectId);
  }

  return { id, projectId, ...result, createdAt: now };
}

export function getLatestSurveyAnalysisV4(projectId: string): SurveyAnalysisV4Result | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM survey_analysis_v4 WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const result = JSON.parse(String(row.result_json)) as Omit<
    SurveyAnalysisV4Result,
    "id" | "projectId" | "createdAt"
  >;
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    ...result,
    createdAt: String(row.created_at),
  };
}
