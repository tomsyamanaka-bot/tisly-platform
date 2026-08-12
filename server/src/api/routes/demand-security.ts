/**
 * 電気デマンド＆セキュリティ API
 * GET  /api/demand-security/v1/customer
 * GET  /api/demand-security/v1/operator
 * GET  /api/demand-security/v1/sites
 * POST /api/demand-security/v1/relay
 */

import { Router } from "express";
import {
  buildDemandCustomerDashboardV1,
  buildDemandOperatorDashboardV1,
} from "../../demand-security/demand-security-dashboard-v1.js";
import {
  listDemandSitesV1,
  setDemandRelayStateV1,
} from "../../demand-security/demand-security-sites-v1.js";

export const demandSecurityRouter = Router();

demandSecurityRouter.get("/sites", (_req, res) => {
  const sites = listDemandSitesV1().map((s) => ({
    id: s.id,
    displayName: s.displayName,
    kind: s.kind,
    tenantId: s.tenantId,
    countryCode: s.countryCode,
    currency: s.currency,
  }));
  res.json({ ok: true, sites });
});

/**
 * お客様向け
 * ?siteId=DEMAND-JP-HOME-001
 */
demandSecurityRouter.get("/customer", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim() || null;
  const dashboard = buildDemandCustomerDashboardV1(siteId);
  res.json({ ok: true, dashboard });
});

/** 社内・事業者向け */
demandSecurityRouter.get("/operator", (_req, res) => {
  const dashboard = buildDemandOperatorDashboardV1();
  res.json({ ok: true, dashboard });
});

/**
 * リレー遠隔操作（社内のみ想定）
 * body: { siteId, relayId, on }
 */
demandSecurityRouter.post("/relay", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const relayId = String(req.body?.relayId ?? "").trim();
  const on = Boolean(req.body?.on);
  if (!siteId || !relayId) {
    res.status(400).json({
      ok: false,
      error: "siteId と relayId が必要です",
    });
    return;
  }
  const site = setDemandRelayStateV1(siteId, relayId, on);
  if (!site) {
    res.status(404).json({
      ok: false,
      error: "対象が見つかりません",
    });
    return;
  }
  const relay = site.relays.find((r) => r.id === relayId);
  res.json({
    ok: true,
    siteId: site.id,
    relay,
    dashboard: buildDemandOperatorDashboardV1(),
  });
});
