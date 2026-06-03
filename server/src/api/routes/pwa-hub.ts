import { Router } from "express";
import type { AuthedRequest } from "../../auth/auth-middleware.js";
import { requireAuth } from "../../auth/auth-middleware.js";
import {
  buildHubCards,
  canAccessPwa,
  type PwaAppId,
  PWA_APP_CATALOG,
} from "../../pwa/pwa-hub.js";
import { buildHubWorkflowLinks } from "../../pwa/hub-insights.js";

export const pwaHubRouter = Router();

pwaHubRouter.get("/hub", requireAuth("viewer"), (req: AuthedRequest, res) => {
  const role = req.admin?.role ?? "viewer";
  const customerCode = (req.admin?.customerCode ?? "TOMS001").toUpperCase();
  const installerSurveyOptional =
    process.env.TISLY_INSTALLER_SURVEY_OPTIONAL === "true";
  const cards = buildHubCards(role, customerCode, { installerSurveyOptional });
  res.json({
    role,
    customerCode,
    apps: cards,
    workflows: buildHubWorkflowLinks(customerCode, role),
    switcher: Object.values(PWA_APP_CATALOG).map((c) => ({
      id: c.id,
      label: c.label,
      visible: canAccessPwa(role, c.id),
    })),
  });
});

pwaHubRouter.get("/access/:pwaId", requireAuth("viewer"), (req: AuthedRequest, res) => {
  const pwaId = String(req.params.pwaId) as PwaAppId;
  if (!PWA_APP_CATALOG[pwaId]) {
    res.status(404).json({ error: "Unknown PWA" });
    return;
  }
  const role = req.admin?.role ?? "viewer";
  if (!canAccessPwa(role, pwaId)) {
    res.status(403).json({ error: "PWA access denied for this role", pwa: pwaId, role });
    return;
  }
  res.json({ ok: true, pwa: pwaId, role });
});
