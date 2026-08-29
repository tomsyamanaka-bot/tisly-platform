import { Router } from "express";
import type { AuthedRequest } from "../../auth/auth-middleware.js";
import { requireAuth } from "../../auth/auth-middleware.js";
import {
  buildHubCardsFiltered,
  buildPracticalHubCardsFiltered,
  canAccessPwa,
  type PwaAppId,
  PWA_APP_CATALOG,
  showOpsPanelsForRole,
} from "../../pwa/pwa-hub.js";
import {
  buildHubNotificationLinks,
  buildHubWorkflowLinks,
} from "../../pwa/hub-insights.js";
import { buildHubOperations } from "../../toms/hub-operations.js";
import { buildPwaPublishAudit } from "../../pwa/pwa-publish-audit.js";
import { listPropertyPortMappingsV1 } from "../../device/device-port-config-v1.js";
import { getPropertyByIdV1 } from "../../shared/customer/customer-property-master-v1.js";
import {
  hasBusinessModulesV1,
  isInternalOpsCustomerV1,
} from "../../tenant/customer-enabled-modules-v1.js";
import { getEnabledModulesForCustomerV1 } from "../../tenant/customer-enabled-modules-store-v1.js";

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

  // 顧客コードに紐づく有効モジュールで出し分け
  const enabledModules = getEnabledModulesForCustomerV1(customerCode);
  const cards = buildHubCardsFiltered(
    role,
    customerCode,
    enabledModules,
    { installerSurveyOptional }
  );
  const practicalApps = buildPracticalHubCardsFiltered(
    role,
    enabledModules
  );
  const showOps =
    showOpsPanelsForRole(role, customerCode) &&
    (enabledModules.includes("*") ||
      enabledModules.includes("ops_deploy") ||
      isInternalOpsCustomerV1(customerCode));
  const showBusiness = hasBusinessModulesV1(enabledModules);

  res.json({
    role,
    customerCode,
    enabledModules,
    practicalApps,
    showOpsPanels: showOps,
    apps: cards,
    workflows: showBusiness
      ? buildHubWorkflowLinks(customerCode, role)
      : [],
    notifications: showBusiness
      ? buildHubNotificationLinks(role)
      : [],
    operations: showBusiness
      ? buildHubOperations(customerCode)
      : null,
    monitoredProperties: buildMonitoredProperties(customerCode),
    switcher: Object.values(PWA_APP_CATALOG).map((c) => ({
      id: c.id,
      label: c.label,
      visible:
        canAccessPwa(role, c.id) &&
        (enabledModules.includes("*") ||
          enabledModules.includes(c.id)),
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
  const customerCode = (req.admin?.customerCode ?? "TOMS001").toUpperCase();
  const enabledModules = getEnabledModulesForCustomerV1(customerCode);
  if (!canAccessPwa(role, pwaId)) {
    res.status(403).json({
      error: "PWA access denied for this role",
      pwa: pwaId,
      role,
    });
    return;
  }
  if (
    !enabledModules.includes("*") &&
    !enabledModules.includes(pwaId)
  ) {
    res.status(403).json({
      error: "Module not enabled for this customer",
      pwa: pwaId,
      customerCode,
    });
    return;
  }
  res.json({ ok: true, pwa: pwaId, role });
});
