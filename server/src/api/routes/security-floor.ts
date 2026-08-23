/**
 * ホームセキュリティ フロア俯瞰
 * GET  /api/security-floor/v1/customer
 * GET  /api/security-floor/v1/operator
 * GET  /api/security-floor/v1/sites
 * POST /api/security-floor/v1/guard-mode
 * POST /api/security-floor/v1/sensor-state
 */

import { Router } from "express";
import {
  buildSecurityFloorCustomerDashboardV1,
  buildSecurityFloorOperatorDashboardV1,
  buildSecurityFloorOperatorSiteV1,
} from "../../security-floor/security-floor-dashboard-v1.js";
import {
  listSecuritySitesV1,
  setSecurityGuardModeV1,
  setSecuritySensorStateV1,
  type SecurityGuardModeV1,
  type SecuritySensorStateV1,
} from "../../security-floor/security-floor-sites-v1.js";
import {
  ackSecurityAlarmsV1,
  demoTogglePrimaryAlertV1,
  setSecurityLightingV1,
} from "../../security-floor/security-floor-soc-v1.js";
import {
  countPushSubscriptions,
  isVapidConfigured,
  sendWebPush,
} from "../../notification/channels/web-push.js";

export const securityFloorRouter = Router();

securityFloorRouter.get("/sites", (_req, res) => {
  const sites = listSecuritySitesV1().map((s) => ({
    id: s.id,
    displayName: s.displayName,
    addressLabel: s.addressLabel,
    tenantId: s.tenantId,
    countryCode: s.countryCode,
    currency: s.currency,
    planStatus: s.planStatus,
  }));
  res.json({ ok: true, sites });
});

securityFloorRouter.get("/customer", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim() || null;
  const dashboard = buildSecurityFloorCustomerDashboardV1(
    siteId
  );
  res.json({ ok: true, dashboard });
});

securityFloorRouter.get("/operator", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (siteId) {
    res.json({
      ok: true,
      dashboard: buildSecurityFloorOperatorDashboardV1(),
      site: buildSecurityFloorOperatorSiteV1(siteId),
    });
    return;
  }
  res.json({
    ok: true,
    dashboard: buildSecurityFloorOperatorDashboardV1(),
  });
});

securityFloorRouter.post("/guard-mode", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const mode = String(
    req.body?.mode ?? ""
  ).trim() as SecurityGuardModeV1;
  if (!siteId || !mode) {
    res.status(400).json({
      ok: false,
      error: "siteId と mode が必要です",
    });
    return;
  }
  const site = setSecurityGuardModeV1(siteId, mode);
  if (!site) {
    res.status(404).json({
      ok: false,
      error: "対象が見つかりません",
    });
    return;
  }
  res.json({
    ok: true,
    siteId: site.id,
    guardMode: site.guardMode,
    dashboard: buildSecurityFloorCustomerDashboardV1(
      site.id
    ),
    operatorSite: buildSecurityFloorOperatorSiteV1(site.id),
  });
});

securityFloorRouter.post("/sensor-state", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const sensorId = String(req.body?.sensorId ?? "").trim();
  const state = String(
    req.body?.state ?? ""
  ).trim() as SecuritySensorStateV1;
  if (!siteId || !sensorId || !state) {
    res.status(400).json({
      ok: false,
      error: "siteId と sensorId と state が必要です",
    });
    return;
  }
  const site = setSecuritySensorStateV1(
    siteId,
    sensorId,
    state
  );
  if (!site) {
    res.status(404).json({
      ok: false,
      error: "対象が見つかりません",
    });
    return;
  }
  res.json({
    ok: true,
    siteId: site.id,
    operatorSite: buildSecurityFloorOperatorSiteV1(site.id),
  });
});

securityFloorRouter.post("/alarm-ack", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({
      ok: false,
      error: "siteId が必要です",
    });
    return;
  }
  ackSecurityAlarmsV1(siteId);
  res.json({
    ok: true,
    siteId,
    dashboard: buildSecurityFloorCustomerDashboardV1(
      siteId
    ),
    operatorSite: buildSecurityFloorOperatorSiteV1(siteId),
  });
});

securityFloorRouter.post("/lighting", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const on = Boolean(req.body?.on);
  if (!siteId) {
    res.status(400).json({
      ok: false,
      error: "siteId が必要です",
    });
    return;
  }
  setSecurityLightingV1(siteId, on);
  res.json({
    ok: true,
    siteId,
    operatorSite: buildSecurityFloorOperatorSiteV1(siteId),
    dashboard: buildSecurityFloorCustomerDashboardV1(
      siteId
    ),
  });
});

securityFloorRouter.post("/test-notify", async (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({
      ok: false,
      error: "siteId が必要です",
    });
    return;
  }
  demoTogglePrimaryAlertV1(siteId);

  const vapidConfigured = isVapidConfigured();
  const subscriptionCount = countPushSubscriptions();
  console.log(
    `[security-floor/test-notify] start site=${siteId} vapidConfigured=${vapidConfigured} subscriptionCount=${subscriptionCount}`
  );

  let webPush: Awaited<ReturnType<typeof sendWebPush>> = {
    channel: "web_push",
    success: false,
    error: "not attempted",
    sent: 0,
    attempted: 0,
    attempts: [],
  };

  try {
    webPush = await sendWebPush({
      title: "TiSLY 通知テスト",
      body: "Push通知が正常に届きました（フロア俯瞰）",
      eventType: "security_floor_test_notify",
      deviceId: siteId,
      url: `/security-v1.html?siteId=${encodeURIComponent(siteId)}`,
      data: { siteId, kind: "test_notify" },
    });
  } catch (err) {
    webPush = {
      channel: "web_push",
      success: false,
      error: err instanceof Error ? err.message : String(err),
      sent: 0,
      attempted: subscriptionCount,
      attempts: [],
    };
    console.error("[security-floor/test-notify] push error:", webPush.error);
  }

  let hint: string | undefined;
  if (!webPush.success) {
    if (!vapidConfigured) {
      hint = "VAPID 未設定 — server で npm run vapid:setup を実行して再起動";
    } else if (subscriptionCount === 0 || webPush.error === "No active subscriptions found") {
      hint =
        "No active subscriptions found — PWA で「Push通知を再登録・購読」を実行してください";
    } else {
      hint = webPush.error ?? "Push 送信失敗";
    }
  }

  const attemptSummary = (webPush.attempts ?? [])
    .map(
      (a) =>
        `${a.success ? "ok" : "fail"}:${a.statusLabel}:…${a.endpointTail}`
    )
    .join("; ");

  console.log(
    `[security-floor/test-notify] done site=${siteId} push=${webPush.success} ` +
      `subs=${subscriptionCount} sent=${webPush.sent ?? 0}/${webPush.attempted ?? 0}` +
      (webPush.error ? ` error=${webPush.error}` : "") +
      (attemptSummary ? ` attempts=[${attemptSummary}]` : "")
  );

  res.json({
    ok: true,
    siteId,
    operatorSite: buildSecurityFloorOperatorSiteV1(siteId),
    dashboard: buildSecurityFloorCustomerDashboardV1(siteId),
    push: {
      ...webPush,
      vapidConfigured,
      subscriptionCount,
      hint,
    },
  });
});
