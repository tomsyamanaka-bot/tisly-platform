import { Router } from "express";
import type { AuthedRequest } from "../../auth/auth-middleware.js";
import { requireAuth } from "../../auth/auth-middleware.js";
import {
  buildHubCards,
  buildPracticalHubCards,
  canAccessPwa,
  type PwaAppId,
  PWA_APP_CATALOG,
  showOpsPanelsForRole,
} from "../../pwa/pwa-hub.js";
import { buildHubNotificationLinks, buildHubWorkflowLinks } from "../../pwa/hub-insights.js";
import { buildHubOperations } from "../../toms/hub-operations.js";
import { buildPwaPublishAudit } from "../../pwa/pwa-publish-audit.js";
import { listPropertyPortMappingsV1 } from "../../device/device-port-config-v1.js";
import { getPropertyByIdV1 } from "../../shared/customer/customer-property-master-v1.js";

export const pwaHubRouter = Router();

function buildMonitoredProperties(customerCode: string) {
  const properties = new Map<
    string,
    {
      propertyId: string;
      propertyName: string;
      deviceIds: Set<string>;
      portCount: number;
    }
  >();
  for (const mapping of listPropertyPortMappingsV1()) {
    const property = getPropertyByIdV1(mapping.propertyId);
    if (property?.customerCode !== customerCode) continue;
    const current = properties.get(mapping.propertyId) ?? {
      propertyId: mapping.propertyId,
      propertyName: property.propertyName,
      deviceIds: new Set<string>(),
      portCount: 0,
    };
    current.deviceIds.add(mapping.deviceId);
    current.portCount += mapping.ports.length;
    properties.set(mapping.propertyId, current);
  }
  return [...properties.values()].map((property) => ({
    propertyId: property.propertyId,
    propertyName: property.propertyName,
    deviceCount: property.deviceIds.size,
    portCount: property.portCount,
    monitoringUrl: "/app/gas-monitor",
  }));
}

/** Phase 1241–1280 — 本番公開前 PWA 監査（認証不要・秘密情報は含まない） */
pwaHubRouter.get("/publish-audit", (_req, res) => {
  res.json(buildPwaPublishAudit());
});

pwaHubRouter.get("/hub", requireAuth("viewer"), (req: AuthedRequest, res) => {
  const role = req.admin?.role ?? "viewer";
  const customerCode = (req.admin?.customerCode ?? "TOMS001").toUpperCase();
  const installerSurveyOptional =
    process.env.TISLY_INSTALLER_SURVEY_OPTIONAL === "true";
  const cards = buildHubCards(role, customerCode, { installerSurveyOptional });
  res.json({
    role,
    customerCode,
    practicalApps: buildPracticalHubCards(role),
    showOpsPanels: showOpsPanelsForRole(role),
    apps: cards,
    workflows: buildHubWorkflowLinks(customerCode, role),
    notifications: buildHubNotificationLinks(role),
    operations: buildHubOperations(customerCode),
    monitoredProperties: buildMonitoredProperties(customerCode),
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
