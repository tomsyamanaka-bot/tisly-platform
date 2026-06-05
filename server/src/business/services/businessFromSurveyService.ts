import { getDatabase } from "../../db/database.js";
import {
  getSurveyProject,
  getLatestAiEstimate,
  listSurveyPhotos,
  getSurveyChecklist,
} from "../../survey/survey-store.js";
import {
  createBusinessProject,
  getBusinessProject,
  saveAiCandidate,
  saveBusinessPhoto,
  updateBusinessProject,
} from "../business-store.js";
import { statusAfterSurveyDone, statusAfterSurveySchedule } from "../business-status.js";
import type { BusinessProject, BusinessPhoto } from "../business-types.js";
import fs from "fs";
import path from "path";

function copySurveyPhotoToBusiness(
  projectId: string,
  photo: { photoPath: string }
): BusinessPhoto | null {
  const rel = photo.photoPath.replace(/^\/+/, "");
  const src = path.join(process.cwd(), "uploads", "survey", rel);
  if (!fs.existsSync(src)) return null;
  const buf = fs.readFileSync(src);
  return saveBusinessPhoto(projectId, "survey", buf.toString("base64"), path.basename(src));
}

export function createBusinessProjectFromSurveyProject(surveyProjectId: string): BusinessProject {
  const survey = getSurveyProject(surveyProjectId);
  if (!survey) throw new Error("survey project not found");

  const row = getDatabase()
    .prepare(`SELECT id FROM business_projects WHERE survey_project_id = ? LIMIT 1`)
    .get(surveyProjectId) as { id: string } | undefined;
  if (row) {
    const existing = getBusinessProject(row.id);
    if (existing) return existing;
  }

  const photos = listSurveyPhotos(surveyProjectId);
  const checklist = getSurveyChecklist(surveyProjectId);
  const checklistSummary = Object.entries(checklist)
    .filter(([, v]) => v && typeof v === "object" && (v as { checked?: boolean }).checked)
    .map(([k]) => k)
    .join(", ");

  const project = createBusinessProject({
    customerId: `BCU-SVY-${survey.customerCode}`,
    customerName: survey.siteName,
    title: survey.siteName,
    address: survey.address ?? "",
    phone: (survey as { phone?: string }).phone ?? "",
    surveyProjectId,
  });

  const ai = getLatestAiEstimate(surveyProjectId);
  if (ai?.recommended) {
    saveAiCandidate(project.id, ai.recommended as Record<string, unknown>, "survey_ai");
  }

  const surveyPhotos: BusinessPhoto[] = [];
  for (const ph of photos.slice(0, 20)) {
    const copied = copySurveyPhotoToBusiness(project.id, ph);
    if (copied) surveyPhotos.push(copied);
  }

  const gpsNote =
    survey.gpsLat != null && survey.gpsLng != null
      ? `GPS: ${survey.gpsLat}, ${survey.gpsLng}`
      : "";

  const memoParts = [
    `Survey連携 (${surveyProjectId})`,
    photos.length ? `写真${photos.length}枚` : "",
    checklistSummary ? `チェックリスト: ${checklistSummary}` : "",
    gpsNote,
  ].filter(Boolean);

  const patch = {
    surveyMemo: memoParts.join(" / "),
    address: survey.address ?? project.address,
    surveyPhotos: surveyPhotos.length ? surveyPhotos : undefined,
  };

  if (photos.length > 0 && project.status === "new") {
    updateBusinessProject(project.id, { ...patch, status: statusAfterSurveySchedule() });
    return updateBusinessProject(project.id, { status: statusAfterSurveyDone() });
  }

  return updateBusinessProject(project.id, patch);
}
