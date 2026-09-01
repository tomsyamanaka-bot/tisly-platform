import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  applyToyoshimaBulkLightsV1,
  applyToyoshimaManualControlV1,
  buildToyoshimaSecurityDashboardV1,
  clearToyoshimaAlarmsV1,
  HOME_JP_TOYOSHIMA_SITE_ID_V1,
  processToyoshimaSecurityEventV1,
  resetToyoshimaSecurityStateForTestV1,
  SEC_JP_TOYOSHIMA_SITE_ID_V1,
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
  });
});
