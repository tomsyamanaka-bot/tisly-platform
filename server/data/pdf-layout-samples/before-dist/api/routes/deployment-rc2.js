import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { completeDeploymentChecklistItem, getDeploymentChecklistRC2, } from "../../deployment-kit/deployment-checklist-rc2.js";
export const deploymentRc2Router = Router();
const installerAuth = [requireAuth("installer")];
deploymentRc2Router.get("/checklist/:projectId", ...installerAuth, (req, res) => {
    const checklist = getDeploymentChecklistRC2(String(req.params.projectId));
    if (!checklist) {
        res.status(404).json({ error: "Project not found" });
        return;
    }
    res.json({ phase: "1161-1200", ...checklist });
});
deploymentRc2Router.post("/checklist/:projectId/item/:itemId/complete", ...installerAuth, (req, res) => {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "installer") && role !== "super_admin") {
        res.status(403).json({ error: "Installer role required" });
        return;
    }
    const body = req.body;
    const item = completeDeploymentChecklistItem(String(req.params.projectId), String(req.params.itemId), req.admin?.username, body.note);
    if (!item) {
        res.status(404).json({ error: "Project or item not found" });
        return;
    }
    const checklist = getDeploymentChecklistRC2(String(req.params.projectId));
    res.status(201).json({ ok: true, item, checklist });
});
