import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { buildTomsKpi } from "../../toms/toms-kpi.js";
import { buildFieldOperationsAudit, findBusinessProjectBySurvey, generateProjectEstimateV4, syncProRemoteFromBusinessProject, listFieldAssets, summarizeFieldAssets, addMaintenanceReplacementParts, listMaintenanceReplacementParts, FIELD_ASSET_KINDS, } from "../../field-operations/index.js";
export const fieldOperationsRouter = Router();
const opsAuth = [requireAuth("surveyor")];
function assertOpsRole(req, res, minRole = "surveyor") {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, minRole) && role !== "super_admin") {
        res.status(403).json({ error: `${minRole} or admin role required` });
        return false;
    }
    return true;
}
fieldOperationsRouter.get("/audit", (_req, res) => {
    res.json(buildFieldOperationsAudit());
});
fieldOperationsRouter.get("/assets", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res, "installer"))
        return;
    const customerCode = req.query.customerCode;
    const kind = req.query.kind;
    const health = req.query.health;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    res.json({
        phase: "1621-1680",
        kinds: FIELD_ASSET_KINDS,
        summary: summarizeFieldAssets(customerCode),
        assets: listFieldAssets({ customerCode, kind, health, limit }),
    });
});
fieldOperationsRouter.get("/kpi", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res, "manager"))
        return;
    const kpi = buildTomsKpi();
    res.json({
        phase: "1621-1680",
        revenue: kpi.revenue,
        grossProfit: kpi.grossProfit,
        maintenanceContracts: kpi.maintenanceContracts ?? kpi.maintenanceCases,
        monthlyProjects: kpi.monthly,
        uninvoiced: kpi.uninvoiced,
        projectCount: kpi.projectCount,
        unpaid: kpi.unpaid,
        anomalyCount: kpi.anomalyCount,
        byCustomer: kpi.byCustomer,
    });
});
fieldOperationsRouter.post("/projects/:projectId/estimate-v4", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res, "manager"))
        return;
    const body = req.body;
    try {
        const result = generateProjectEstimateV4(String(req.params.projectId), {
            runAnalysis: body.runAnalysis,
        });
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
fieldOperationsRouter.post("/projects/:projectId/pro-remote-sync", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res, "installer"))
        return;
    try {
        const result = syncProRemoteFromBusinessProject(String(req.params.projectId));
        res.status(201).json(result);
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
fieldOperationsRouter.get("/survey/:surveyProjectId/business-link", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res))
        return;
    const businessProjectId = findBusinessProjectBySurvey(String(req.params.surveyProjectId));
    res.json({
        surveyProjectId: req.params.surveyProjectId,
        businessProjectId,
        projectDashboardUrl: businessProjectId ? `/project/${businessProjectId}` : null,
        estimateUrl: businessProjectId
            ? `/business/projects/${businessProjectId}/estimate`
            : null,
    });
});
fieldOperationsRouter.post("/maintenance/reports/:reportId/parts", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res, "maintenance"))
        return;
    const body = req.body;
    if (!body.customerCode || !body.parts?.length) {
        res.status(400).json({ error: "customerCode and parts required" });
        return;
    }
    try {
        const created = addMaintenanceReplacementParts({
            reportId: String(req.params.reportId),
            customerCode: body.customerCode,
            parts: body.parts,
        });
        res.status(201).json({ parts: created });
    }
    catch (e) {
        res.status(400).json({ error: String(e) });
    }
});
fieldOperationsRouter.get("/maintenance/reports/:reportId/parts", ...opsAuth, (req, res) => {
    if (!assertOpsRole(req, res, "maintenance"))
        return;
    res.json({ parts: listMaintenanceReplacementParts(String(req.params.reportId)) });
});
