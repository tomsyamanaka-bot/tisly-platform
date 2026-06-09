import { Router } from "express";
import { listTemplates } from "../../provisioning/site-templates.js";
import { createSite, getSiteDetail, listSites, } from "../../provisioning/site-provisioner.js";
export const sitesRouter = Router();
sitesRouter.get("/templates", (_req, res) => {
    res.json({ templates: listTemplates(), phase: "141-160-rc1" });
});
sitesRouter.get("/", (req, res) => {
    const tenantId = req.query.tenantId;
    res.json({ sites: listSites(tenantId), count: listSites(tenantId).length });
});
sitesRouter.get("/:id", (req, res) => {
    const site = getSiteDetail(req.params.id);
    if (!site) {
        res.status(404).json({ error: "site not found" });
        return;
    }
    res.json(site);
});
sitesRouter.post("/create", (req, res) => {
    const { name, tenantId, templateId, address, lat, lng, actorId, actorLabel } = req.body;
    if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name required" });
        return;
    }
    try {
        const result = createSite({
            name,
            tenantId,
            templateId,
            address,
            lat,
            lng,
            actorId,
            actorLabel,
        });
        res.status(201).json({ ok: true, ...result });
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
