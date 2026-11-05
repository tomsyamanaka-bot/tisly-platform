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
  defaultCustomerSecuritySiteIdV1,
  listOperatorSecuritySitesV1,
  listReviewDemoSecuritySitesV1,
  listTenantScopedSecuritySitesV1,
} from "../../shared/customer/customer-security-sites-v1.js";
import { viewerMayUseLiveHardwareV1 } from "../../shared/customer/review-sandbox-v1.js";
import { customerTenantFromTokenV1 } from "../../auth/customer-auth.js";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  ackSecurityAlarmsV1,
  demoTogglePrimaryAlertV1,
  setSecurityLightingV1,
} from "../../security-floor/security-floor-soc-v1.js";
import { listSecurityHistoryV1 } from "../../security-floor/security-history-v1.js";
import { isTesterTenantV1 } from "../../shared/customer/tester-tenant-v1.js";
import {
  countPushSubscriptions,
  isVapidConfigured,
  sendWebPush,
} from "../../notification/channels/web-push.js";
import { getKeepRisingCustomerSettingsV1 } from "../../home/home-keeprising-settings-v1.js";
import {
  HOME_JP_KEEPRISING_SITE_ID_V1,
  KEEPRISING_CUSTOMER_CODE_V1,
  KEEPRISING_DISPLAY_NAME_V1,
  SEC_JP_KEEPRISING_SITE_ID_V1,
} from "../../home/home-keeprising-security-v1.js";

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

/**
 * 顧客 Security 物件（ログイン必須・自邸 1 件固定）
 * 他物件の選択肢はサーバ側で遮断する。
 */
function bearerTokenV1(req: { header: (name: string) => string | undefined }): string {
  const auth = req.header("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function noStoreCustomerV1(res: { setHeader: (k: string, v: string) => void }): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

securityFloorRouter.get(
  "/customer-sites",
  requireAuth("viewer"),
  (req: AuthedRequest, res) => {
    noStoreCustomerV1(res);
    const code = String(req.admin?.customerCode ?? "").trim();
    const sites = listTenantScopedSecuritySitesV1(code);
    const defaultSiteId =
      sites[0]?.siteId || defaultCustomerSecuritySiteIdV1();
    res.json({
      ok: true,
      sites,
      defaultSiteId,
      locked: true,
      scope: "tenant_single",
    });
  }
);

/** 社内 Security 物件セレクタ（UI 表示対象の全件） */
securityFloorRouter.get("/operator-sites", (req, res) => {
  const includeLive = viewerMayUseLiveHardwareV1(req);
  const sites = includeLive
    ? listOperatorSecuritySitesV1()
    : listReviewDemoSecuritySitesV1();
  res.json({
    ok: true,
    sites,
    defaultSiteId: includeLive
      ? defaultCustomerSecuritySiteIdV1()
      : sites[0]?.siteId || "SEC-JP-MORIYA-001",
    locked: false,
    scope: includeLive ? "operator_all" : "review_sandbox",
    reviewSandbox: !includeLive,
  });
});

securityFloorRouter.get("/customer", (req, res) => {
  noStoreCustomerV1(res);
  const requested = String(req.query.siteId ?? "").trim() || null;
  const profile = customerTenantFromTokenV1(bearerTokenV1(req));
  const siteId = profile ? profile.securitySiteId : requested;
  const dashboard = buildSecurityFloorCustomerDashboardV1(
    siteId
  );
  res.json({ ok: true, dashboard, locked: Boolean(profile) });
});

/** 最近のできごと · センサー検知履歴（直近50件） */
securityFloorRouter.get("/history", (req, res) => {
  noStoreCustomerV1(res);
  const profile = customerTenantFromTokenV1(bearerTokenV1(req));
  const siteId = profile
    ? profile.securitySiteId
    : String(req.query.siteId ?? "").trim();
  const homeSiteId = profile
    ? profile.homeSiteId
    : String(req.query.homeSiteId ?? "").trim();
  const customerCode = String(
    req.query.customerCode ??
      (req as AuthedRequest).admin?.customerCode ??
      ""
  ).trim();
  const includeMock =
    String(req.query.includeMock ?? "") === "1" ||
    isTesterTenantV1(customerCode);
  const history = listSecurityHistoryV1({
    siteId: siteId || null,
    homeSiteId: homeSiteId || null,
    includeMock,
    limit: Number(req.query.limit ?? 50),
  });
  res.json(history);
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

  const keepRisingSite =
    siteId === SEC_JP_KEEPRISING_SITE_ID_V1 ||
    siteId.toUpperCase().includes("KEEPRISING");
  const keepRisingDisarmed =
    keepRisingSite &&
    getKeepRisingCustomerSettingsV1().guardMode === "disarmed";

  try {
    if (keepRisingDisarmed) {
      webPush = {
        channel: "web_push",
        success: false,
        error: "guard disarmed",
        sent: 0,
        attempted: 0,
        attempts: [],
      };
    } else if (keepRisingSite) {
      webPush = await sendWebPush({
        title: `【TiSLY警報】${KEEPRISING_DISPLAY_NAME_V1}`,
        body: "センサーが反応しました（Keep Rising）",
        eventType: "keeprising_sensor_alert",
        deviceId: SEC_JP_KEEPRISING_SITE_ID_V1,
        url: "/customer/security",
        audience: "customer",
        icon: "/icons/icon-192.png?v=2003",
        badge: "/icons/icon-192.png?v=2003",
        data: {
          siteId: SEC_JP_KEEPRISING_SITE_ID_V1,
          propertyId: HOME_JP_KEEPRISING_SITE_ID_V1,
          homeSiteId: HOME_JP_KEEPRISING_SITE_ID_V1,
          securitySiteId: SEC_JP_KEEPRISING_SITE_ID_V1,
          customerCode: KEEPRISING_CUSTOMER_CODE_V1,
          audience: "customer",
          kind: "sensor_alert",
        },
      });
    } else {
      webPush = await sendWebPush({
        title: "TiSLY 通知テスト",
        body: "Push通知が正常に届きました",
        eventType: "security_floor_test_notify",
        deviceId: siteId,
        url: `/security-v1.html?siteId=${encodeURIComponent(siteId)}`,
        data: { siteId, kind: "test_notify" },
      });
    }
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
    } else if (
      subscriptionCount === 0 ||
      webPush.error === "No active subscriptions found" ||
      webPush.error === "Subscription invalid"
    ) {
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
