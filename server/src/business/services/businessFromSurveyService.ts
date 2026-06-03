import { getDatabase } from "../../db/database.js";
import {
  getSurveyProject,
  getLatestAiEstimate,
  listSurveyPhotos,
} from "../../survey/survey-store.js";
import {
  createBusinessProject,
  getBusinessProject,
  saveAiCandidate,
  updateBusinessProject,
} from "../business-store.js";
import { statusAfterSurveyDone } from "../business-status.js";
import type { BusinessProject } from "../business-types.js";

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
  const project = createBusinessProject({
    customerId: `BCU-SVY-${survey.customerCode}`,
    customerName: survey.siteName,
    title: survey.siteName,
    address: survey.address ?? "",
    surveyProjectId,
  });

  const ai = getLatestAiEstimate(surveyProjectId);
  if (ai?.recommended) {
    saveAiCandidate(project.id, ai.recommended as Record<string, unknown>, "survey_ai");
  }

  if (photos.length > 0) {
    return updateBusinessProject(project.id, {
      surveyMemo: `Survey連携: 写真${photos.length}枚`,
      status: statusAfterSurveyDone(),
    });
  }

  return getBusinessProject(project.id)!;
}
