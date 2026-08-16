/**
 * TiSLY HOME 住設統合 API
 * GET  /api/home/v1/sites
 * GET  /api/home/v1/customer?siteId=
 * GET  /api/home/v1/operator
 * GET  /api/home/v1/quick-switch
 * GET  /api/home/v1/control-logs?siteId=
 * POST /api/home/v1/control
 */

import { Router } from "express";
import {
  buildHomeCustomerDashboardV1,
  buildHomeOperatorDashboardV1,
  buildHomeQuickSwitchV1,
} from "../../home/home-dashboard-v1.js";
import {
  applyHomeControlV1,
  type HomeControlTargetV1,
} from "../../home/home-control-v1.js";
import {
  findHomeSiteV1,
  listHomeSitesV1,
} from "../../home/home-sites-v1.js";
import {
  ensureHomeSeedV1,
  listHomeControlLogsV1,
  listHomeSiteRowsV1,
  recordHomeAccessLogV1,
  recordHomeControlLogV1,
} from "../../home/home-store-v1.js";
import {
  syncHomeDefaultLockFromSwitchBotV1,
  syncHomeLockFromSwitchBotV1,
} from "../../home/home-switchbot-sync-v1.js";

export const homeRouter = Router();

const CONTROL_TARGETS_V1: HomeControlTargetV1[] = [
  "circuit",
  "bath",
  "aircon",
  "lock",
];

/** 物件一覧（SaaS 契約情報つき） */
homeRouter.get("/sites", (_req, res) => {
  ensureHomeSeedV1();
  const sites = listHomeSitesV1().map((s) => ({
    id: s.id,
    displayName: s.displayName,
    addressLabel: s.addressLabel,
    kind: s.kind,
    tenantId: s.tenantId,
    countryCode: s.countryCode,
    currency: s.currency,
    voltageSpec: s.voltageSpec,
    planCode: s.planCode,
    planStatus: s.planStatus,
    monthlyFee: s.monthlyFee,
  }));
  res.json({ ok: true, sites, saasRows: listHomeSiteRowsV1() });
});

/** お客様（住まい）向け */
homeRouter.get("/customer", async (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim() || null;
  try {
    await syncHomeLockFromSwitchBotV1(siteId);
  } catch {
    // モック継続
  }
  const dashboard = buildHomeCustomerDashboardV1(siteId);
  res.json({ ok: true, dashboard });
});

/** 社内・事業者向け */
homeRouter.get("/operator", async (_req, res) => {
  try {
    await syncHomeDefaultLockFromSwitchBotV1();
  } catch {
    // モック継続
  }
  const dashboard = buildHomeOperatorDashboardV1();
  res.json({ ok: true, dashboard });
});

/** どの画面からでも呼べる切り替え用 */
homeRouter.get("/quick-switch", (_req, res) => {
  res.json({ ok: true, items: buildHomeQuickSwitchV1() });
});

/** 操作ログ（社内確認用） */
homeRouter.get("/control-logs", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId が必要です" });
    return;
  }
  const limit = Number(req.query.limit ?? 20);
  res.json({
    ok: true,
    siteId,
    logs: listHomeControlLogsV1(siteId, limit),
  });
});

/**
 * ワンタップ制御
 * body: { siteId, target, action, deviceKey?, value?, actor? }
 */
homeRouter.post("/control", async (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const target = String(req.body?.target ?? "").trim();
  const action = String(req.body?.action ?? "").trim();
  const deviceKey = req.body?.deviceKey
    ? String(req.body.deviceKey)
    : null;
  const actor = req.body?.actor ? String(req.body.actor) : null;

  if (!siteId || !target || !action) {
    res.status(400).json({
      ok: false,
      error: "siteId · target · action が必要です",
    });
    return;
  }
  if (!CONTROL_TARGETS_V1.includes(target as HomeControlTargetV1)) {
    res.status(400).json({
      ok: false,
      error: "未対応の制御対象です",
    });
    return;
  }

  let result;
  try {
    result = await applyHomeControlV1({
      siteId,
      target: target as HomeControlTargetV1,
      action,
      deviceKey,
      value: req.body?.value,
      actor,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "制御に失敗しました";
    res.status(500).json({ ok: false, error: msg });
    return;
  }

  const site = findHomeSiteV1(siteId);
  recordHomeControlLogV1({
    siteId,
    tenantId: site.tenantId,
    deviceKind: target,
    deviceKey,
    action,
    value: req.body?.value,
    actor,
    result: result.ok ? "ok" : "error",
  });

  if (!result.ok) {
    res.status(400).json({ ok: false, error: result.error });
    return;
  }

  // 施錠・解錠は入退室ログにも残す
  if (target === "lock") {
    const latest = site.lock.accessLog[0];
    if (latest) {
      recordHomeAccessLogV1({
        siteId,
        tenantId: site.tenantId,
        credentialType: latest.credentialType,
        holderName: latest.holderName,
        action: latest.action,
        occurredAt: latest.occurredAt,
      });
    }
  }

  res.json({
    ok: true,
    message: result.message,
    siteId,
    target,
    action,
    deviceKey,
    dashboard: buildHomeCustomerDashboardV1(siteId),
  });
});
