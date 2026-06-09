import { createMaintenanceCase } from "../maintenance/maintenance-store.js";
import { getSurveyProject, listSurveyPhotos, getSurveyProjectNotes } from "./survey-store.js";
import { getLatestAiIntake } from "./ai-intake.js";
export function createMaintenanceFromSurvey(projectId) {
    const project = getSurveyProject(projectId);
    if (!project)
        throw new Error("project not found");
    const photos = listSurveyPhotos(projectId);
    const intake = getLatestAiIntake(projectId);
    const notesText = getSurveyProjectNotes(projectId);
    const devicePlaceholders = (intake?.recommended_devices ?? []).map((d) => `${d.type}×${d.qty}`);
    if (!devicePlaceholders.length) {
        devicePlaceholders.push("esp32×1", "pir×2", "camera×1");
    }
    const memo = [
        `現調案件 ${projectId} から自動起票`,
        `現場: ${project.siteName}`,
        photos.length ? `写真 ${photos.length} 枚` : null,
        notesText ? `メモ: ${notesText}` : null,
    ]
        .filter(Boolean)
        .join("\n");
    const c = createMaintenanceCase({
        customerCode: project.customerCode,
        siteName: project.siteName,
        deviceIds: devicePlaceholders,
        notes: memo,
        status: "open",
    });
    return { caseId: c.caseId, devicePlaceholders, notes: memo };
}
