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

  it("dashboard exposes comm health, alarm, and notify sensors", () => {
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.ok(dash.commHealth);
    assert.match(dash.commHealth.onlineSummary, /オンライン/);
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
    assert.match(dash1.commHealth.boardTempLabel, /正常/);
    assert.ok(dash1.lightingDurationSec >= 5);
    assert.ok(dash1.perimeterTimeoutSec >= 30);

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
});
