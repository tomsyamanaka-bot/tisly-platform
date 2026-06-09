import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getProjectDetailV1, listProjectsV1 } from "../../projects/projects-v1-store.js";
export const projectsV1Router = Router();
const auth = [requireAuth("surveyor")];
function assertRole(req, res) {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
        res.status(403).json({ error: "Surveyor or admin role required" });
        return false;
    }
    return true;
}
projectsV1Router.get("/projects", ...auth, (req, res) => {
    if (!assertRole(req, res))
        return;
    const customerCode = req.query.customerCode ?? req.admin?.customerCode;
    res.json({ projects: listProjectsV1({ customerCode }) });
});
projectsV1Router.get("/projects/:id", ...auth, (req, res) => {
    if (!assertRole(req, res))
        return;
    const detail = getProjectDetailV1(String(req.params.id), req.query.source);
    if (!detail) {
        res.status(404).json({ error: "project not found" });
        return;
    }
    res.json(detail);
});
