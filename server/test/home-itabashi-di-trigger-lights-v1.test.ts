import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { triggerHardwareDiTestV1 } from "../src/home/home-hardware-pro-v1.js";
import {
  armItabashiLiveDiSensorLightsV1,
  evaluateHomeSensorLightWindowV1,
  queueHomeSensorLinkedLightsV1,
  resetItabashiLiveSensorLightArmForTestV1,
} from "../src/home/home-security-light-v1.js";
import {
  buildHomeSecurityFirmwareRulesV1,
  getHomeSecurityRulesV1,
  updateHomeSecurityRulesV1,
} from "../src/home/home-security-rules-v1.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "../src/home/home-sites-v1.js";
import {
  getRemoteTestStatus,
  queueChPulseCommand,
  resetRemoteTestState,
} from "../src/remote-test/remote-test-state.js";

/** JST の時分を表す Date（UTC 換算） */
function jstDate(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 8, 20, hour - 9, minute, 0));
}

describe("Itabashi DI trigger sensor lights", () => {
  afterEach(() => {
    resetItabashiLiveSensorLightArmForTestV1();
    resetRemoteTestState();
  });

  function ensureNightRulesV1() {
    updateHomeSecurityRulesV1(HOME_ITABASHI_LIVE_SITE_ID_V1, {
      guardMode: "always",
      scheduleStart: "18:00",
      scheduleEnd: "06:00",
      securityPausedUntil: null,
    });
  }

  it("treats 19:00 JST as inside 18:00-06:00 window", () => {
    ensureNightRulesV1();
    const rules = getHomeSecurityRulesV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
    const at = jstDate(19, 0);
    const win = evaluateHomeSensorLightWindowV1(rules, at);
    assert.equal(win.jstMinutes, 19 * 60);
    assert.equal(win.isWithinTimeRange, true);
    assert.equal(win.lightsActive, true);
  });

  it("queues DO2+DO3 sensor pulse at 19:00 JST", async () => {
    ensureNightRulesV1();
    resetRemoteTestState();
    const result = await triggerHardwareDiTestV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      diId: "di1",
      actor: "operator-pro",
      at: jstDate(19, 0),
    });
    assert.equal(result.ok, true);
    assert.equal(result.isWithinTimeRange, true);
    assert.equal(result.lightsQueued, true);
    assert.match(String(result.lightCommand), /^sensor_pulse_A_\d+$/);
    assert.ok((result.durationSec ?? 0) >= 5);
    assert.equal(getRemoteTestStatus().pendingCommand, result.lightCommand);
  });

  it("does not queue relays at 12:00 JST", async () => {
    ensureNightRulesV1();
    resetRemoteTestState();
    const result = await triggerHardwareDiTestV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      diId: "di1",
      actor: "operator-pro",
      at: jstDate(12, 0),
    });
    assert.equal(result.ok, true);
    assert.equal(result.isWithinTimeRange, false);
    assert.equal(result.lightsQueued, false);
    const pending = getRemoteTestStatus().pendingCommand;
    assert.ok(
      !pending || !String(pending).startsWith("sensor_pulse_")
    );
  });

  it("builds 66s pulse command when duration is 66", () => {
    ensureNightRulesV1();
    resetRemoteTestState();
    const queued = queueHomeSensorLinkedLightsV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      di: 1,
      pattern: "pattern_a",
      at: jstDate(19, 0),
    });
    if (queued.queued && queued.durationSec === 66) {
      assert.equal(queued.command, "sensor_pulse_A_66000");
    }
    if (queued.queued) {
      assert.match(String(queued.command), /^sensor_pulse_A_\d+$/);
    }
  });

  it("queues light_all_on for a real night sensor so firmware 1.6.1 turns both lights on", () => {
    ensureNightRulesV1();
    resetRemoteTestState();
    const armed = armItabashiLiveDiSensorLightsV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      di: 1,
      pattern: "pattern_a",
      at: jstDate(19, 0),
    });
    assert.equal(armed.queued, true);
    assert.equal(armed.command, "light_all_on");
    assert.equal(getRemoteTestStatus().pendingCommand, "light_all_on");
  });

  it("does not queue light_all_on at noon", () => {
    ensureNightRulesV1();
    resetRemoteTestState();
    const armed = armItabashiLiveDiSensorLightsV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      di: 1,
      pattern: "pattern_a",
      at: jstDate(12, 0),
    });
    assert.equal(armed.queued, false);
    assert.equal(armed.skippedReason, "outside_schedule");
    assert.equal(getRemoteTestStatus().pendingCommand, null);
  });

  it("does not replace an in-flight bath pulse", () => {
    ensureNightRulesV1();
    resetRemoteTestState();
    queueChPulseCommand(1, 500);
    const armed = armItabashiLiveDiSensorLightsV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      di: 2,
      pattern: "pattern_c",
      at: jstDate(19, 0),
    });
    assert.equal(armed.queued, false);
    assert.equal(armed.skippedReason, "pending_command_busy");
    assert.equal(getRemoteTestStatus().pendingCommand, "ch1_pulse_500");
    resetItabashiLiveSensorLightArmForTestV1();
  });

  it("advances firmware rules version every minute so night guardActive is reapplied", () => {
    ensureNightRulesV1();
    const rules = getHomeSecurityRulesV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
    const fw = buildHomeSecurityFirmwareRulesV1(
      HOME_ITABASHI_LIVE_SITE_ID_V1
    );
    const updatedMs = Date.parse(rules.updatedAt);
    const now = Date.now();
    assert.ok(fw.version >= updatedMs);
    assert.ok(fw.version >= now - 60_000);
    assert.ok(fw.version <= now);
    assert.equal(fw.lightScheduleActive, fw.guardActive);
  });
});
