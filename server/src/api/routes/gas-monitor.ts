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
import { listGasPropertiesV1 } from "../../gas-monitor/gas-monitor-sites-v1.js";

export const gasMonitorRouter = Router();

gasMonitorRouter.get("/properties", (_req, res) => {
  const properties = listGasPropertiesV1().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    kind: p.kind,
    tenantId: p.tenantId,
    countryCode: p.countryCode,
    currency: p.currency,
  }));
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
  res.json({ ok: true, dashboard });
});

/** ガス事業者向けダッシュボード */
gasMonitorRouter.get("/operator", (_req, res) => {
  const dashboard = buildGasOperatorDashboardV1();
  res.json({ ok: true, dashboard });
});
