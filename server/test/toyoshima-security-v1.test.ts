import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  applyToyoshimaBulkLightsV1,
  applyToyoshimaManualControlV1,
  buildToyoshimaSecurityDashboardV1,
  clearToyoshimaAlarmsV1,
  HOME_JP_TOYOSHIMA_SITE_ID_V1,
  processToyoshimaSecurityEventV1,
  recordToyoshimaHeartbeatV1,
  setToyoshimaHeartbeatAtForTestV1,
  resetToyoshimaSecurityStateForTestV1,
  runToyoshimaHeartbeatWatchdogV1,
  SEC_JP_TOYOSHIMA_SITE_ID_V1,
  TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1,
  updateToyoshimaNotifyModeV1,
} from "../src/home/home-toyoshima-security-v1.js";
import { findHomeSiteV1 } from "../src/home/home-sites-v1.js";
import {
  findSecuritySiteV1,
  SECURITY_FLOOR_TOYOSHIMA_SITE_ID_V1,
} from "../src/security-floor/security-floor-sites-v1.js";

describe("toyoshima-security-v1", () => {
  afterEach(() => {
    resetToyoshimaSecurityStateForTestV1();
  });

  it("HOME site is registered at catalog tail", () => {
    const site = findHomeSiteV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.equal(site.id, HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.match(site.displayName, /豊島邸/);
    assert.equal(site.customerCode, "TOYOSHIMA001");
  });

  it("SEC site is registered with main and detached sensors", () => {
    const site = findSecuritySiteV1(SECURITY_FLOOR_TOYOSHIMA_SITE_ID_V1);
    assert.equal(site.id, SEC_JP_TOYOSHIMA_SITE_ID_V1);
    assert.equal(site.propertyId, HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.ok(site.sensors.some((s) => s.id === "tm-main-di1"));
    assert.ok(site.sensors.some((s) => s.id === "tm-det-di2"));
  });

  it("dashboard exposes main and detached building cards", () => {
    const dash = buildToyoshimaSecurityDashboardV1(SEC_JP_TOYOSHIMA_SITE_ID_V1);
    assert.equal(dash.main.label, "母屋");
    assert.equal(dash.detached.label, "はなれ");
    assert.equal(dash.main.do.length, 3);
    assert.equal(dash.detached.di.length, 2);
  });

  it("main beam event lights DO1/DO2 when schedule active", async () => {
    const result = await processToyoshimaSecurityEventV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      building: "main",
      di: 1,
    });
    assert.equal(result.ok, true);
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.main.di[0].state, "detecting");
    assert.ok(dash.timeline.some((t) => t.kind === "main_beam"));
  });

  it("detached road DI1 records timeline", async () => {
    await processToyoshimaSecurityEventV1({
      building: "detached",
      di: 1,
    });
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.ok(
      dash.timeline.some((t) => t.kind === "detached_road")
    );
  });

  it("manual DO toggle updates state", () => {
    const result = applyToyoshimaManualControlV1({
      building: "main",
      action: "do1_on",
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.do[0].on, true);
  });

  it("patlite test starts blinking on detached DO2", () => {
    const result = applyToyoshimaManualControlV1({
      building: "detached",
      action: "patlite_test",
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.do[1].blinking, true);
  });

  it("dashboard exposes comm health, alarm, and notify sensors", async () => {
    await recordToyoshimaHeartbeatV1({ building: "main" });
    await recordToyoshimaHeartbeatV1({ building: "detached" });
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.ok(dash.commHealth);
    assert.match(dash.commHealth.onlineSummary, /オンライン/);
    assert.equal(dash.commHealth.uiOnline, true);
    assert.equal(dash.commHealth.isHardwareOnline, true);
    assert.ok(Array.isArray(dash.notifySensors));
    assert.equal(dash.notifySensors.length, 3);
    assert.equal(dash.alarm.active, false);
  });

  it("bulk lights and alarm clear work", async () => {
    await processToyoshimaSecurityEventV1({
      building: "detached",
      di: 1,
    });
    const dash1 = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash1.alarm.active, true);
    clearToyoshimaAlarmsV1();
    const dash2 = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash2.alarm.active, false);
    applyToyoshimaBulkLightsV1({ action: "on" });
    const dash3 = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash3.main.do[0].on, true);
    assert.equal(dash3.detached.do[0].on, true);
  });

  it("notify mode update persists", () => {
    updateToyoshimaNotifyModeV1({
      sensorId: "detached_road",
      mode: "silent",
    });
    const dash = buildToyoshimaSecurityDashboardV1();
    const road = dash.notifySensors.find((s) => s.id === "detached_road");
    assert.equal(road?.mode, "silent");
    assert.match(road?.label || "", /道路側センサー（はなれ）/);
  });

  it("dashboard exposes patliteThreatEnabled for customer daily settings", () => {
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(typeof dash.patliteThreatEnabled, "boolean");
    assert.ok(
      dash.notifySensors.some((s) => s.label.includes("遠近センサー"))
    );
  });

  it("timed bulk lights auto-off is accepted", () => {
    const result = applyToyoshimaBulkLightsV1({
      action: "on",
      durationSec: 180,
    });
    assert.equal(result.ok, true);
    assert.equal(result.durationSec, 180);
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.main.do[0].on, true);
  });

  it("heartbeat records and watchdog marks offline after grace", async () => {
    resetToyoshimaSecurityStateForTestV1();
    await recordToyoshimaHeartbeatV1({ building: "main", boardTemp: 36.4 });
    const dash1 = buildToyoshimaSecurityDashboardV1();
    assert.match(dash1.commHealth.onlineSummary, /オンライン/);
    assert.ok(dash1.commHealth.lastHeartbeatAt);
    assert.equal(dash1.commHealth.boardTempC, 36.4);
    assert.match(dash1.commHealth.boardTempLabel, /36\.4℃/);
    assert.match(dash1.commHealth.boardTempLabel, /正常/);
    assert.ok(dash1.lightingDurationSec >= 5);
    assert.ok(dash1.perimeterTimeoutSec >= 30);
    assert.equal(dash1.heartbeatWatchEnabled, true);

    const stale = new Date(
      Date.now() - TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1 - 1000
    ).toISOString();
    setToyoshimaHeartbeatAtForTestV1("main", stale);
    setToyoshimaHeartbeatAtForTestV1("detached", stale);
    await runToyoshimaHeartbeatWatchdogV1();
    const dash2 = buildToyoshimaSecurityDashboardV1();
    assert.match(dash2.commHealth.onlineSummary, /オフライン/);
    assert.ok(dash2.timeline.some((t) => t.kind === "comm_loss"));
  });

  it("heartbeat watch OFF mutes push and shelly auto reboot", async () => {
    resetToyoshimaSecurityStateForTestV1();
    const { updateToyoshimaOpsConfigV1 } = await import(
      "../src/home/home-toyoshima-ops-config-v1.js"
    );
    updateToyoshimaOpsConfigV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
      heartbeatWatchEnabled: false,
    });
    await recordToyoshimaHeartbeatV1({ building: "main", boardTemp: 36.0 });
    const stale = new Date(
      Date.now() - TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1 - 1000
    ).toISOString();
    setToyoshimaHeartbeatAtForTestV1("main", stale);
    setToyoshimaHeartbeatAtForTestV1("detached", stale);
    await runToyoshimaHeartbeatWatchdogV1();
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.heartbeatWatchEnabled, false);
    assert.equal(
      dash.timeline.some((t) => t.kind === "comm_loss"),
      false
    );
    updateToyoshimaOpsConfigV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
      heartbeatWatchEnabled: true,
    });
  });

  it("heartbeat API marks ONLINE and updates JST label fields", async () => {
    resetToyoshimaSecurityStateForTestV1();
    await recordToyoshimaHeartbeatV1({
      building: "main",
      boardTemp: 35.0,
    });
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.match(dash.commHealth.onlineSummary, /オンライン/);
    assert.match(dash.commHealth.onlineSummary, /実機稼働中|主装置/);
    assert.ok(dash.commHealth.lastHeartbeatAt);
    assert.equal(dash.main.online, true);
    assert.match(dash.commHealth.boardTempLabel, /適温・正常|正常/);
  });

  it("stale offline recovers to ONLINE after both-building heartbeat", async () => {
    resetToyoshimaSecurityStateForTestV1();
    const {
      TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1,
    } = await import("../src/home/home-toyoshima-security-v1.js");
    const stale = new Date(
      Date.now() - TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1 - 5_000
    ).toISOString();
    setToyoshimaHeartbeatAtForTestV1("main", stale);
    setToyoshimaHeartbeatAtForTestV1("detached", stale);
    const offline = buildToyoshimaSecurityDashboardV1();
    assert.match(offline.commHealth.onlineSummary, /オフライン/);

    await recordToyoshimaHeartbeatV1({ building: "main" });
    await recordToyoshimaHeartbeatV1({ building: "detached" });
    const online = buildToyoshimaSecurityDashboardV1();
    assert.match(online.commHealth.onlineSummary, /オンライン/);
    assert.equal(online.main.online, true);
    assert.equal(online.detached.online, true);
    assert.ok(online.commHealth.lastHeartbeatAt);
  });

  it("null board temp shows monitoring label without fake value", () => {
    resetToyoshimaSecurityStateForTestV1();
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.commHealth.boardTempC, null);
    assert.match(dash.commHealth.boardTempLabel, /正常監視中/);
  });

  it("SOC heartbeat snapshot uses Toyoshima SSOT", async () => {
    resetToyoshimaSecurityStateForTestV1();
    const { getToyoshimaSocHeartbeatSnapshotV1 } = await import(
      "../src/home/home-toyoshima-security-v1.js"
    );
    await recordToyoshimaHeartbeatV1({ building: "main", boardTemp: 36.4 });
    const snap = getToyoshimaSocHeartbeatSnapshotV1();
    assert.equal(snap.deviceOnline, true);
    assert.equal(snap.boardTempC, 36.4);
    assert.ok(snap.lastHeartbeatAt);
  });

  it("heartbeat board_temp caution and overheat warning", async () => {
    resetToyoshimaSecurityStateForTestV1();
    await recordToyoshimaHeartbeatV1({ building: "main", boardTemp: 48.2 });
    const dashCaution = buildToyoshimaSecurityDashboardV1();
    assert.equal(dashCaution.commHealth.boardTempLevel, "caution");
    assert.match(dashCaution.commHealth.boardTempLabel, /注意/);

    await recordToyoshimaHeartbeatV1({ building: "main", boardTemp: 62.5 });
    const dashWarn = buildToyoshimaSecurityDashboardV1();
    assert.equal(dashWarn.commHealth.boardTempLevel, "warning");
    assert.match(dashWarn.commHealth.onlineSummary, /盤内高温警告/);
    assert.ok(dashWarn.timeline.some((t) => t.kind === "board_overheat"));
    assert.ok(dashWarn.alarm.active);
  });

  it("status SSOT uses lastHeartbeatAt only and 5min UI window", async () => {
    const { buildToyoshimaStatusSsotV1 } = await import(
      "../src/home/home-toyoshima-security-v1.js"
    );
    resetToyoshimaSecurityStateForTestV1();
    const empty = buildToyoshimaStatusSsotV1();
    assert.equal(empty.ssot, "toyoshima-commHealth");
    assert.equal(empty.uiOnline, false);
    assert.equal(empty.isHardwareOnline, false);
    assert.match(empty.customerOnline, /オフライン（通信途絶）/);
    assert.equal(empty.lastHeartbeatAt, null);

    await recordToyoshimaHeartbeatV1({ building: "main" });
    await recordToyoshimaHeartbeatV1({ building: "detached" });
    const online = buildToyoshimaStatusSsotV1();
    assert.equal(online.uiOnline, true);
    assert.equal(online.isHardwareOnline, online.uiOnline);
    assert.match(online.customerOnline, /正常稼働中（オンライン）/);
    assert.match(online.operatorOnline, /正常稼働中（オンライン）/);
    assert.ok(online.lastHeartbeatAt);

    const stale = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
    setToyoshimaHeartbeatAtForTestV1("main", stale);
    setToyoshimaHeartbeatAtForTestV1("detached", stale);
    const uiOff = buildToyoshimaStatusSsotV1();
    assert.equal(uiOff.uiOnline, false);
    assert.equal(uiOff.isHardwareOnline, false);
    assert.match(uiOff.customerOnline, /オフライン（通信途絶）/);
  });

  it("sim heartbeat 36.2C drives header and card from isHardwareOnline", async () => {
    const { buildToyoshimaStatusSsotV1 } = await import(
      "../src/home/home-toyoshima-security-v1.js"
    );
    resetToyoshimaSecurityStateForTestV1();
    await recordToyoshimaHeartbeatV1({
      building: "main",
      boardTemp: 36.2,
    });
    await recordToyoshimaHeartbeatV1({
      building: "detached",
      boardTemp: 36.2,
    });
    const ssot = buildToyoshimaStatusSsotV1();
    assert.equal(ssot.isHardwareOnline, true);
    assert.equal(ssot.uiOnline, ssot.isHardwareOnline);
    assert.match(ssot.customerOnline, /正常稼働中（オンライン）/);
    assert.match(ssot.operatorOnline, /正常稼働中（オンライン）/);
    assert.equal(ssot.boardTempC, 36.2);
    assert.match(ssot.boardTempLabel, /36\.2℃/);
  });

  it("status SSOT firmware matches OTA runningVersion", async () => {
    const { resetTislyOtaStoreForTestV1, recordTislyOtaDeviceFirmwareV1 } =
      await import("../src/firmware/tisly-rp2350-ota-v1.js");
    const {
      buildToyoshimaStatusSsotV1,
      formatTislyFirmwareCustomerLabelV1,
    } = await import("../src/home/home-toyoshima-security-v1.js");
    resetTislyOtaStoreForTestV1();
    resetToyoshimaSecurityStateForTestV1();
    assert.equal(formatTislyFirmwareCustomerLabelV1(null), "―");
    assert.equal(formatTislyFirmwareCustomerLabelV1("1.1.0"), "v1.1.0");
    const empty = buildToyoshimaStatusSsotV1();
    assert.equal(empty.firmwareLabel, "―");
    assert.equal(empty.firmwareVersion, null);
    recordTislyOtaDeviceFirmwareV1({
      siteKey: "toyoshima",
      deviceId: "rp2350-toyoshima-main-01",
      firmwareVersion: "1.1.0",
    });
    const ssot = buildToyoshimaStatusSsotV1();
    assert.equal(ssot.firmwareVersion, "1.1.0");
    assert.equal(ssot.firmwareLabel, "v1.1.0");
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.ota?.runningVersion, "1.1.0");
    assert.equal(dash.commHealth.firmwareLabel, "v1.1.0");
  });

  it("heartbeat store upserts JSON state without wiping other keys", async () => {
    const {
      saveToyoshimaHeartbeatStoreV1,
      loadToyoshimaHeartbeatStoreV1,
    } = await import("../src/home/home-toyoshima-heartbeat-store-v1.js");
    const at = new Date().toISOString();
    saveToyoshimaHeartbeatStoreV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      main: {
        lastHeartbeatAt: at,
        lastCommAt: at,
        boardTempC: 36.1,
      },
      detached: {
        lastHeartbeatAt: at,
        lastCommAt: at,
        boardTempC: null,
      },
      updatedAt: at,
    });
    const loaded = loadToyoshimaHeartbeatStoreV1(
      HOME_JP_TOYOSHIMA_SITE_ID_V1
    );
    assert.ok(loaded);
    assert.equal(loaded.main.lastHeartbeatAt, at);
    assert.equal(loaded.main.boardTempC, 36.1);
    assert.equal(loaded.detached.lastHeartbeatAt, at);
  });
});
