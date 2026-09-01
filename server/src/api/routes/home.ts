/**
 * TiSLY HOME 住設統合 API
 * GET  /api/home/v1/sites
 * GET  /api/home/v1/customer?siteId=
 * GET  /api/home/v1/operator
 * GET  /api/home/v1/quick-switch
 * GET  /api/home/v1/control-logs?siteId=
 * GET  /api/home/v1/intercom-events?siteId=
 * GET  /api/home/v1/doorphone/snapshot?siteId=
 * POST /api/home/v1/doorphone/control
 * GET  /api/home/v1/switchbot-status
 * GET  /api/home/v1/switchbot-devices
 * POST /api/home/v1/control
 */

import { Router } from "express";
import {
  buildHomeCustomerDashboardV1,
  buildHomeOperatorDashboardV1,
  buildHomeQuickSwitchV1,
} from "../../home/home-dashboard-v1.js";
import {
  buildHomeCustomerFacingDashboardV1,
  buildHomeCustomerSiteOptionsV1,
  sanitizeHomeCustomerDashboardV1,
} from "../../home/home-customer-facing-v1.js";
import { buildHomeCustomerMgmtViewV1 } from "../../home/home-customer-mgmt-v1.js";
import {
  registerHomeSiteV1,
  updateHomeSiteRegistryV1,
} from "../../home/home-customer-registry-v1.js";
import {
  applyHomeControlV1,
  type HomeControlTargetV1,
} from "../../home/home-control-v1.js";
import {
  findHomeSiteV1,
  listHomeSitesV1,
} from "../../home/home-sites-v1.js";
import {
  applyHomeDoorphoneControlV1,
  buildDoorphoneSnapshotSvgV1,
  buildDoorphoneViewExtrasV1,
  getDoorphoneSiteOrThrow,
} from "../../home/home-doorphone-v1.js";
import {
  ensureHomeSeedV1,
  listHomeControlLogsV1,
  listHomeIntercomEventsV1,
  listHomeSiteRowsV1,
  recordHomeAccessLogV1,
  recordHomeControlLogV1,
  recordHomeIntercomEventV1,
} from "../../home/home-store-v1.js";
import {
  syncHomeDefaultLockFromSwitchBotV1,
  syncHomeSwitchBotDevicesV1,
} from "../../home/home-switchbot-sync-v1.js";
import {
  cancelBathScheduleV1,
  createBathDailyScheduleV1,
  createBathDelayScheduleV1,
  createBathOnceScheduleV1,
  listBathSchedulesV1,
  VALID_DELAY_MINUTES,
} from "../../home/home-bath-schedule-v1.js";
import { recordSystemLogV1 } from "../../home/home-system-log-v1.js";
import {
  applyHomeSceneV1,
  listHomeScenesV1,
  type HomeSceneIdV1,
} from "../../home/home-scene-v1.js";
import {
  buildHomeActivityTimelineV1,
  buildHomeSecurityStatsV1,
} from "../../home/home-security-stats-v1.js";
import {
  buildHomeSecurityFirmwareRulesV1,
  getHomeSecurityRulesV1,
  homeGuardModeLabelJaV1,
  updateHomeSecurityRulesV1,
  type HomeDi1LightModeV1,
  type HomeDi2Light100vModeV1,
  type HomeDi2LightModeV1,
  type HomeDi2StandaloneLightModeV1,
  type HomeGuardModeV1,
  type HomeNotifyModeV1,
} from "../../home/home-security-rules-v1.js";
import {
  buildHomeSecurityNotifyPolicyV1,
  processHomeSecurityEventV1,
} from "../../home/home-security-notify-v1.js";
import {
  applyToyoshimaBulkLightsV1,
  applyToyoshimaManualControlV1,
  buildToyoshimaActivityReportV1,
  buildToyoshimaSecurityDashboardV1,
  clearToyoshimaAlarmsV1,
  HOME_JP_TOYOSHIMA_SITE_ID_V1,
  isToyoshimaSecuritySiteIdV1,
  processToyoshimaSecurityEventV1,
  SEC_JP_TOYOSHIMA_SITE_ID_V1,
  sendToyoshimaTestNotifyV1,
  syncToyoshimaConfigToFirmwareV1,
  updateToyoshimaNotifyModeV1,
} from "../../home/home-toyoshima-security-v1.js";
import {
  buildSwitchBotHomeStatusV1,
  listSwitchBotDevicesV1,
} from "../../home/switchbot_client.js";

export const homeRouter = Router();

const CONTROL_TARGETS_V1: HomeControlTargetV1[] = [
  "circuit",
  "bath",
  "aircon",
  "lock",
  "intercom",
  "security_light",
  "iot",
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

/** お客様（住まい）向け — 物件選択（シンプル） */
homeRouter.get("/customer-sites", (_req, res) => {
  res.json({ ok: true, sites: buildHomeCustomerSiteOptionsV1() });
});

/** お客様（住まい）向け — 内部情報を除外したダッシュボード */
homeRouter.get("/customer", async (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim() || null;
  try {
    await syncHomeSwitchBotDevicesV1(siteId);
  } catch {
    // モック継続
  }
  const dashboard = buildHomeCustomerFacingDashboardV1(siteId);
  res.json({ ok: true, dashboard });
});

/** 社内「顧客を見る」 — TiSLY HOME 契約物件のみ */
homeRouter.get("/customer-mgmt", (_req, res) => {
  res.json({ ok: true, view: buildHomeCustomerMgmtViewV1() });
});

/** 社内「顧客を見る」 — 新規物件登録 */
homeRouter.post("/customer-mgmt/sites", (req, res) => {
  try {
    const site = registerHomeSiteV1({
      displayName: req.body?.displayName ?? req.body?.display_name,
      addressLabel: req.body?.addressLabel ?? req.body?.address,
      planCode: req.body?.planCode ?? req.body?.plan_code,
      contactName: req.body?.contactName ?? req.body?.contact_name,
      contactPhone: req.body?.contactPhone ?? req.body?.contact_phone,
      contactEmail: req.body?.contactEmail ?? req.body?.contact_email,
      customerCode: req.body?.customerCode ?? req.body?.customer_code,
      registrationSource: "manual",
    });
    res.status(201).json({ ok: true, site, view: buildHomeCustomerMgmtViewV1() });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: String((error as Error).message),
    });
  }
});

/** 社内「顧客を見る」 — 物件更新 */
homeRouter.patch("/customer-mgmt/sites/:siteId", (req, res) => {
  const siteId = String(req.params.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId が必要です" });
    return;
  }
  try {
    const site = updateHomeSiteRegistryV1(siteId, {
      displayName: req.body?.displayName ?? req.body?.display_name,
      addressLabel: req.body?.addressLabel ?? req.body?.address,
      planCode: req.body?.planCode ?? req.body?.plan_code,
      contactName: req.body?.contactName ?? req.body?.contact_name,
      contactPhone: req.body?.contactPhone ?? req.body?.contact_phone,
      contactEmail: req.body?.contactEmail ?? req.body?.contact_email,
      planStatus: req.body?.planStatus ?? req.body?.plan_status,
    });
    res.json({ ok: true, site, view: buildHomeCustomerMgmtViewV1() });
  } catch (error) {
    const message = String((error as Error).message);
    res.status(message.includes("見つかりません") ? 404 : 400).json({
      ok: false,
      error: message,
    });
  }
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

/**
 * SwitchBot 連携ステータス
 * `.env` に資格情報が入っていれば本番 VPS でも自動で real になる。
 */
homeRouter.get("/switchbot-status", (_req, res) => {
  res.json({ ok: true, switchbot: buildSwitchBotHomeStatusV1() });
});

/** SwitchBot デバイス一覧（社内確認用・資格情報は返さない） */
homeRouter.get("/switchbot-devices", async (_req, res) => {
  const status = buildSwitchBotHomeStatusV1();
  if (status.mode === "mock") {
    res.json({ ok: true, switchbot: status, devices: [] });
    return;
  }
  try {
    const result = await listSwitchBotDevicesV1();
    res.json({
      ok: result.ok,
      switchbot: status,
      devices: result.data ?? [],
      error: result.error,
    });
  } catch {
    res.json({
      ok: false,
      switchbot: status,
      devices: [],
      error: "SwitchBot デバイス一覧の取得に失敗しました",
    });
  }
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

/** 風呂予約・遅延実行一覧 */
homeRouter.get("/bath-schedules", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId が必要です" });
    return;
  }
  res.json({
    ok: true,
    siteId,
    delayOptions: VALID_DELAY_MINUTES,
    schedules: listBathSchedulesV1(siteId),
  });
});

/** 風呂予約・遅延実行の作成 */
homeRouter.post("/bath-schedules", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const kind = String(req.body?.kind ?? "").trim();
  const actor = req.body?.actor ? String(req.body.actor) : "app";
  if (!siteId || !kind) {
    res.status(400).json({
      ok: false,
      error: "siteId · kind が必要です",
    });
    return;
  }
  try {
    let schedule;
    if (kind === "delay") {
      schedule = createBathDelayScheduleV1({
        siteId,
        delayMinutes: Number(req.body?.delayMinutes),
        actor,
      });
    } else if (kind === "daily") {
      schedule = createBathDailyScheduleV1({
        siteId,
        dailyTime: String(req.body?.dailyTime ?? ""),
        actor,
      });
    } else if (kind === "once") {
      schedule = createBathOnceScheduleV1({
        siteId,
        runAt: String(req.body?.runAt ?? ""),
        actor,
      });
    } else {
      res.status(400).json({ ok: false, error: "未対応の kind です" });
      return;
    }
    res.status(201).json({ ok: true, schedule });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: String((error as Error).message),
    });
  }
});

/** 風呂予約キャンセル */
homeRouter.delete("/bath-schedules/:scheduleId", (req, res) => {
  const siteId = String(req.query.siteId ?? req.body?.siteId ?? "").trim();
  const scheduleId = Number(req.params.scheduleId);
  const actor = req.body?.actor ? String(req.body.actor) : "app";
  if (!siteId || !Number.isFinite(scheduleId)) {
    res.status(400).json({
      ok: false,
      error: "siteId · scheduleId が必要です",
    });
    return;
  }
  const cancelled = cancelBathScheduleV1({ siteId, scheduleId, actor });
  if (!cancelled) {
    res.status(404).json({ ok: false, error: "予約が見つかりません" });
    return;
  }
  res.json({ ok: true, siteId, scheduleId });
});

/** インターホン来客履歴 */
homeRouter.get("/intercom-events", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId が必要です" });
    return;
  }
  const limit = Number(req.query.limit ?? 20);
  res.json({
    ok: true,
    siteId,
    events: listHomeIntercomEventsV1(siteId, limit),
  });
});

/** ドアホン玄関スナップショット（SVG モック / 実機は将来 RTSP キャプチャ） */
homeRouter.get("/doorphone/snapshot", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId が必要です" });
    return;
  }
  const site = findHomeSiteV1(siteId);
  if (!site) {
    res.status(404).json({ ok: false, error: "物件が見つかりません" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(buildDoorphoneSnapshotSvgV1(site));
});

/** ドアホン拡張操作（mic / speaker / snapshot / record） */
homeRouter.post("/doorphone/control", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const action = String(req.body?.action ?? "").trim();
  if (!siteId || !action) {
    res.status(400).json({
      ok: false,
      error: "siteId · action が必要です",
    });
    return;
  }
  let site;
  try {
    site = getDoorphoneSiteOrThrow(siteId);
  } catch (err) {
    res.status(404).json({
      ok: false,
      error: err instanceof Error ? err.message : "物件が見つかりません",
    });
    return;
  }
  const result = applyHomeDoorphoneControlV1(
    site,
    action,
    req.body?.value
  );
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({
    ...result,
    siteId,
    intercom: buildDoorphoneViewExtrasV1(site),
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
    res.status(400).json({
      ok: false,
      error: result.error,
      statusCode: result.statusCode,
      switchBotMessage: result.switchBotMessage,
      message: result.error,
    });
    return;
  }

  // 風呂 auto_fill は bath-state 側で記録済み
  // 防犯ライトは home-security-light 側で記録済み
  if (
    !(target === "bath" && action === "auto_fill") &&
    target !== "security_light"
  ) {
    recordSystemLogV1({
      siteId,
      tenantId: site.tenantId,
      category: "manual_control",
      message: `${site.displayName}: ${result.message ?? "操作しました"}`,
      detail: { target, action, deviceKey },
      actor: actor ?? "app",
    });
  }

  // インターホン操作は来客イベントに残す
  if (target === "intercom") {
    const latest = site.intercom.visitors[0];
    recordHomeIntercomEventV1({
      siteId,
      tenantId: site.tenantId,
      deviceKey: site.intercom.deviceKey,
      eventType: action,
      visitorLabel: latest?.label ?? "",
      handledAs: latest?.handledAs ?? "",
      actor,
      occurredAt: latest?.occurredAt,
    });
  }

  // 施錠・解錠は入退室ログにも残す
  if (target === "lock" || action === "unlock_door") {
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

  const audience = String(req.body?.audience ?? "").trim();
  const fullDashboard = buildHomeCustomerDashboardV1(siteId);
  const dashboard =
    audience === "customer"
      ? sanitizeHomeCustomerDashboardV1(fullDashboard)
      : fullDashboard;

  res.json({
    ok: true,
    message: result.message,
    siteId,
    target,
    action,
    deviceKey,
    dashboard,
  });
});

const SCENE_IDS: HomeSceneIdV1[] = ["away", "welcome", "goodnight"];

/** 防犯ルール取得 */
homeRouter.get("/security-rules", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId required" });
    return;
  }
  const site = findHomeSiteV1(siteId);
  if (site.id !== siteId) {
    res.status(404).json({ ok: false, error: "site not found" });
    return;
  }
  const rules = getHomeSecurityRulesV1(siteId);
  res.json({
    ok: true,
    rules: {
      ...rules,
      guardModeLabel: homeGuardModeLabelJaV1(rules.guardMode),
    },
    notifyPolicy: buildHomeSecurityNotifyPolicyV1(rules),
  });
});

/** 防犯ルール PATCH 本体（PUT/POST 共通） */
function applyHomeSecurityRulesPatchV1(
  siteId: string,
  body: Record<string, unknown>,
  actor: string
) {
  const rules = updateHomeSecurityRulesV1(siteId, {
    guardMode: body?.guardMode as HomeGuardModeV1 | undefined,
    scheduleStart: body?.scheduleStart as string | undefined,
    scheduleEnd: body?.scheduleEnd as string | undefined,
    lightingDurationSec: body?.lightingDurationSec as number | undefined,
    di1DurationSec: body?.di1DurationSec as number | undefined,
    di1LightMode: body?.di1LightMode as HomeDi1LightModeV1 | undefined,
    perimeterTimeoutSec: body?.perimeterTimeoutSec as number | undefined,
    di2LightMode: body?.di2LightMode as HomeDi2LightModeV1 | undefined,
    di2Light100vMode: body?.di2Light100vMode as
      | HomeDi2Light100vModeV1
      | undefined,
    di2AlertDurationSec: body?.di2AlertDurationSec as number | undefined,
    di2StandaloneDurationSec: body?.di2StandaloneDurationSec as
      | number
      | undefined,
    di2Standalone24vMode: body?.di2Standalone24vMode as
      | HomeDi2StandaloneLightModeV1
      | undefined,
    di2Standalone100vMode: body?.di2Standalone100vMode as
      | HomeDi2StandaloneLightModeV1
      | undefined,
    notifyDi1SilentLogOnly: body?.notifyDi1SilentLogOnly as
      | boolean
      | undefined,
    notifyDi2InstantPush: body?.notifyDi2InstantPush as boolean | undefined,
    notifyDi1Mode: body?.notifyDi1Mode as HomeNotifyModeV1 | undefined,
    notifyStagedMode: body?.notifyStagedMode as HomeNotifyModeV1 | undefined,
    notifyDi2Mode: body?.notifyDi2Mode as HomeNotifyModeV1 | undefined,
    securityPausedUntil: body?.securityPausedUntil as string | null | undefined,
  });
  recordSystemLogV1({
    siteId,
    category: "manual_control",
    message: "防犯ルール設定を更新",
    detail: {
      guardMode: rules.guardMode,
      scheduleStart: rules.scheduleStart,
      scheduleEnd: rules.scheduleEnd,
    },
    actor,
  });
  return rules;
}

/** 防犯ルール更新（merge） */
homeRouter.put("/security-rules", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId required" });
    return;
  }
  const site = findHomeSiteV1(siteId);
  if (site.id !== siteId) {
    res.status(404).json({ ok: false, error: "site not found" });
    return;
  }
  const rules = applyHomeSecurityRulesPatchV1(
    siteId,
    req.body ?? {},
    String(req.body?.actor ?? "app")
  );
  res.json({
    ok: true,
    rules: {
      ...rules,
      guardModeLabel: homeGuardModeLabelJaV1(rules.guardMode),
    },
    notifyPolicy: buildHomeSecurityNotifyPolicyV1(rules),
  });
});

/** RP2350 DI 検知イベント（heartbeat 以外の明示 POST） */
homeRouter.post("/security/event", async (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId required" });
    return;
  }
  const site = findHomeSiteV1(siteId);
  if (site.id !== siteId) {
    res.status(404).json({ ok: false, error: "site not found" });
    return;
  }
  const di = Number(req.body?.di ?? req.body?.input);
  if (di !== 1 && di !== 2) {
    res.status(400).json({ ok: false, error: "di must be 1 or 2" });
    return;
  }
  try {
    const result = await processHomeSecurityEventV1({
      siteId,
      di,
      pattern: req.body?.pattern as string | undefined,
    });
    res.json({
      ok: true,
      siteId,
      di,
      pattern: result.pattern,
      pushSent: result.pushSent,
      notifyPolicy: buildHomeSecurityNotifyPolicyV1(
        getHomeSecurityRulesV1(siteId)
      ),
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** TiSLY Security 遠隔設定反映（RP2350 ポーリング連動） */
homeRouter.post("/security/config", (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId required" });
    return;
  }
  const site = findHomeSiteV1(siteId);
  if (site.id !== siteId) {
    res.status(404).json({ ok: false, error: "site not found" });
    return;
  }
  const rules = applyHomeSecurityRulesPatchV1(
    siteId,
    req.body ?? {},
    String(req.body?.actor ?? "security-v1")
  );
  res.json({
    ok: true,
    message: "実機へ設定を反映しました",
    rules: {
      ...rules,
      guardModeLabel: homeGuardModeLabelJaV1(rules.guardMode),
    },
    notifyPolicy: buildHomeSecurityNotifyPolicyV1(rules),
    firmware: buildHomeSecurityFirmwareRulesV1(siteId),
  });
});

/** RP2350 向け防犯ルール JSON（ポーリング同期） */
homeRouter.get("/security-rules/firmware", (req, res) => {
  const siteId =
    String(req.query.siteId ?? "HOME-JP-ITABASHI-LIVE").trim();
  const token = String(
    req.headers["x-remote-test-token"] ?? ""
  ).trim();
  const expected = String(process.env.REMOTE_TEST_TOKEN ?? "").trim();
  if (expected && token !== expected) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  res.json({
    ok: true,
    rules: buildHomeSecurityFirmwareRulesV1(siteId),
  });
});

/** ワンタップ一括シーン */
homeRouter.post("/scene", async (req, res) => {
  const siteId = String(req.body?.siteId ?? "").trim();
  const scene = String(req.body?.scene ?? "").trim() as HomeSceneIdV1;
  if (!siteId || !SCENE_IDS.includes(scene)) {
    res.status(400).json({
      ok: false,
      error: "siteId and scene (away|welcome|goodnight) required",
    });
    return;
  }
  const result = await applyHomeSceneV1({
    siteId,
    scene,
    actor: req.body?.actor,
  });
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  const fullDashboard = buildHomeCustomerDashboardV1(siteId);
  const dashboard = sanitizeHomeCustomerDashboardV1(fullDashboard);
  res.json({ ...result, dashboard });
});

/** シーン一覧 */
homeRouter.get("/scenes", (_req, res) => {
  res.json({ ok: true, scenes: listHomeScenesV1() });
});

/** 防犯統計ダッシュボード */
homeRouter.get("/security-stats", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim();
  if (!siteId) {
    res.status(400).json({ ok: false, error: "siteId required" });
    return;
  }
  const days = Number(req.query.days ?? 7);
  res.json({
    ok: true,
    stats: buildHomeSecurityStatsV1({ siteId, days }),
  });
});

/** アクティビティタイムライン */
homeRouter.get("/activity-timeline", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim() || null;
  const limit = Number(req.query.limit ?? 50);
  const timeline = buildHomeActivityTimelineV1({ siteId, limit });
  res.json({ ok: true, timeline });
});

/** 豊島邸 Security ダッシュボード */
function registerToyoshimaHomeRoutes(prefix: string): void {
  homeRouter.get(`${prefix}/dashboard`, (req, res) => {
    const siteId = String(req.query.siteId ?? SEC_JP_TOYOSHIMA_SITE_ID_V1).trim();
    if (!isToyoshimaSecuritySiteIdV1(siteId)) {
      res.status(404).json({ ok: false, error: "豊島邸サイトではありません" });
      return;
    }
    res.json({
      ok: true,
      dashboard: buildToyoshimaSecurityDashboardV1(siteId),
    });
  });

  homeRouter.post(`${prefix}/event`, async (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    const building = String(req.body?.building ?? "").trim();
    if (building !== "main" && building !== "detached") {
      res.status(400).json({
        ok: false,
        error: "building must be main or detached",
      });
      return;
    }
    const di = Number(req.body?.di);
    if (di !== 1 && di !== 2) {
      res.status(400).json({ ok: false, error: "di must be 1 or 2" });
      return;
    }
    try {
      const result = await processToyoshimaSecurityEventV1({
        siteId,
        building: building as "main" | "detached",
        di,
        deviceId: req.body?.deviceId as string | undefined,
      });
      res.json({
        ...result,
        ok: true,
        dashboard: buildToyoshimaSecurityDashboardV1(siteId),
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  homeRouter.post(`${prefix}/control`, (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    const building = String(req.body?.building ?? "").trim();
    if (building !== "main" && building !== "detached") {
      res.status(400).json({
        ok: false,
        error: "building must be main or detached",
      });
      return;
    }
    const action = String(req.body?.action ?? "").trim();
    const result = applyToyoshimaManualControlV1({
      siteId,
      building: building as "main" | "detached",
      action: action as
        | "do1_on"
        | "do1_off"
        | "do2_on"
        | "do2_off"
        | "do3_on"
        | "do3_off"
        | "patlite_test",
      actor: String(req.body?.actor ?? "app"),
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: "未対応の操作です" });
      return;
    }
    res.json({
      ok: true,
      building: result.state,
      dashboard: buildToyoshimaSecurityDashboardV1(siteId),
    });
  });

  homeRouter.post(`${prefix}/sync-config`, (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    const homeId = HOME_JP_TOYOSHIMA_SITE_ID_V1;
    const firmware = syncToyoshimaConfigToFirmwareV1(siteId);
    const rules = getHomeSecurityRulesV1(homeId);
    res.json({
      ok: true,
      message: "主装置・子機へ設定を反映しました",
      firmware,
      dashboard: buildToyoshimaSecurityDashboardV1(siteId),
      rules: {
        ...rules,
        guardModeLabel: homeGuardModeLabelJaV1(rules.guardMode),
      },
    });
  });

  homeRouter.post(`${prefix}/bulk-lights`, (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    const action = req.body?.action === "off" ? "off" : "on";
    applyToyoshimaBulkLightsV1({
      siteId,
      action,
      actor: String(req.body?.actor ?? "customer-portal"),
    });
    res.json({
      ok: true,
      action,
      dashboard: buildToyoshimaSecurityDashboardV1(siteId),
    });
  });

  homeRouter.post(`${prefix}/alarm-clear`, (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    clearToyoshimaAlarmsV1({
      siteId,
      actor: String(req.body?.actor ?? "customer-portal"),
    });
    res.json({
      ok: true,
      dashboard: buildToyoshimaSecurityDashboardV1(siteId),
    });
  });

  homeRouter.put(`${prefix}/notify-mode`, (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    const sensorId = String(req.body?.sensorId ?? "").trim();
    const mode = String(req.body?.mode ?? "").trim();
    if (
      sensorId !== "detached_road" &&
      sensorId !== "detached_path" &&
      sensorId !== "main_beam"
    ) {
      res.status(400).json({ ok: false, error: "sensorId invalid" });
      return;
    }
    try {
      updateToyoshimaNotifyModeV1({
        siteId,
        sensorId,
        mode: mode as "critical" | "silent" | "off",
        actor: String(req.body?.actor ?? "customer-portal"),
      });
      res.json({
        ok: true,
        dashboard: buildToyoshimaSecurityDashboardV1(siteId),
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  homeRouter.post(`${prefix}/test-notify`, async (req, res) => {
    const siteId = String(
      req.body?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1
    ).trim();
    try {
      const result = await sendToyoshimaTestNotifyV1(siteId);
      res.json({
        ...result,
        dashboard: buildToyoshimaSecurityDashboardV1(siteId),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  homeRouter.get(`${prefix}/report`, (req, res) => {
    const siteId = String(req.query.siteId ?? SEC_JP_TOYOSHIMA_SITE_ID_V1).trim();
    const format = String(req.query.format ?? "text").trim();
    const body = buildToyoshimaActivityReportV1(siteId);
    if (format === "json") {
      res.json({
        ok: true,
        report: body,
        dashboard: buildToyoshimaSecurityDashboardV1(siteId),
      });
      return;
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="toyoshima-security-report.txt"'
    );
    res.send(body);
  });
}

registerToyoshimaHomeRoutes("/toyoshima");
registerToyoshimaHomeRoutes("/toshima");
