import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { runSurveyAnalysisV4, getLatestSurveyAnalysisV4 } from "../../survey/ai-survey-analysis-v4.js";
import { runSurveyAnalysisV2, getLatestSurveyAnalysisV2 } from "../../survey/ai-survey-analysis-v2.js";
export const aiRouter = Router();
const aiAuth = [requireAuth("surveyor")];
function assertAiRole(req, res) {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
        res.status(403).json({ error: "Surveyor or admin role required" });
        return false;
    }
    return true;
}
aiRouter.post("/survey-analysis", ...aiAuth, (req, res) => {
    if (!assertAiRole(req, res))
        return;
    const body = req.body;
    const projectId = body.surveyProjectId ?? body.projectId;
    if (!projectId) {
        res.status(400).json({ error: "projectId or surveyProjectId required" });
        return;
    }
    try {
        const result = runSurveyAnalysisV4(String(projectId));
        res.status(201).json({ phase: "1121-1160", version: "v4", analysis: result });
    }
    catch (e) {
        res.status(404).json({ error: String(e) });
    }
});
aiRouter.post("/survey-analysis-v2", ...aiAuth, (req, res) => {
    if (!assertAiRole(req, res))
        return;
    const body = req.body;
    const projectId = body.surveyProjectId ?? body.projectId;
    if (!projectId) {
        res.status(400).json({ error: "projectId or surveyProjectId required" });
        return;
    }
    try {
        const result = runSurveyAnalysisV2(String(projectId));
        res.status(201).json({
            phase: "1161-1200",
            version: "v2",
            estimate_candidates: result.estimateCandidates,
            risk_notes: result.riskNotes,
            missing_info: result.missingInfo,
            analysis: result,
        });
    }
    catch (e) {
        res.status(404).json({ error: String(e) });
    }
});
aiRouter.get("/survey-analysis-v2/:projectId", ...aiAuth, (req, res) => {
    if (!assertAiRole(req, res))
        return;
    const result = getLatestSurveyAnalysisV2(String(req.params.projectId));
    if (!result) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json({
        version: "v2",
        estimate_candidates: result.estimateCandidates,
        risk_notes: result.riskNotes,
        missing_info: result.missingInfo,
        analysis: result,
    });
});
aiRouter.get("/survey-analysis/:projectId", ...aiAuth, (req, res) => {
    if (!assertAiRole(req, res))
        return;
    const result = getLatestSurveyAnalysisV4(String(req.params.projectId));
    if (!result) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json({ version: "v4", analysis: result });
});
