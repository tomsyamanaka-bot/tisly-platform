import { getBusinessProject } from "../business/business-store.js";
import { generateFloorMapFromSurvey } from "../survey/survey-to-pro-map.js";
export function syncProRemoteFromBusinessProject(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    if (!project.surveyProjectId)
        throw new Error("survey project not linked");
    const result = generateFloorMapFromSurvey(project.surveyProjectId);
    return {
        phase: "1681-1720",
        projectId,
        surveyProjectId: project.surveyProjectId,
        customerCode: result.customerCode,
        tiers: result.tiers,
        layers: result.layers,
        roofCreated: false,
    };
}
