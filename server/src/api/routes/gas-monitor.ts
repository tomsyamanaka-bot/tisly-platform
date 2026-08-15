/**
 * ガス見守り API
 * GET /api/gas-monitor/v1/customer
 * GET /api/gas-monitor/v1/operator
 * GET /api/gas-monitor/v1/properties
 */

import { Router } from "express";
import {
  buildGasCustomerDashboardV1,
  buildGasOperatorDashboardV1,
} from "../../gas-monitor/gas-monitor-dashboard-v1.js";
import { listPropertyPortMappingsV1 } from "../../device/device-port-config-v1.js";
import { getPropertyByIdV1 } from "../../shared/customer/customer-property-master-v1.js";

export const gasMonitorRouter = Router();

gasMonitorRouter.get("/properties", (_req, res) => {
  const properties: Array<{
    id: string;
    displayName: string;
    kind: "detached";
    tenantId: string;
    countryCode: "JP";
    currency: "JPY";
  }> = [];
  const knownIds = new Set<string>();
  for (const mapping of listPropertyPortMappingsV1()) {
    if (knownIds.has(mapping.propertyId)) continue;
    const property = getPropertyByIdV1(mapping.propertyId);
    const customerCode = property?.customerCode ?? "TOMS001";
    properties.push({
      id: mapping.propertyId,
      displayName: property?.propertyName ?? "登録済み物件",
      kind: "detached",
      tenantId: `tenant_${customerCode.toLowerCase()}`,
      countryCode: "JP",
      currency: "JPY",
    });
    knownIds.add(mapping.propertyId);
  }
  res.json({ ok: true, properties });
});

/**
 * 建物グループ一覧（追記）
 * アパート等の親カード用
 */
gasMonitorRouter.get("/buildings", (_req, res) => {
  const dashboard = buildGasOperatorDashboardV1();
  res.json({
    ok: true,
    buildings: dashboard.buildings,
    lifeCareAlertCount: dashboard.lifeCareAlertCount,
  });
});

/**
 * お客様向け
 * ?propertyId=GAS-JP-HOME-001
 */
gasMonitorRouter.get("/customer", (req, res) => {
  const propertyId = String(req.query.propertyId ?? "").trim() || null;
  const dashboard = buildGasCustomerDashboardV1(propertyId);
  res.json({
    ok: true,
    empty: dashboard === null,
    dashboard,
  });
});

/** ガス事業者向けダッシュボード */
gasMonitorRouter.get("/operator", (_req, res) => {
  const dashboard = buildGasOperatorDashboardV1();
  res.json({ ok: true, dashboard });
});
