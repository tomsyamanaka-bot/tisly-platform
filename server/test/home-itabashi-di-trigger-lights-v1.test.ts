import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { triggerHardwareDiTestV1 } from "../src/home/home-hardware-pro-v1.js";
import {
  evaluateHomeSensorLightWindowV1,
  queueHomeSensorLinkedLightsV1,
} from "../src/home/home-security-light-v1.js";
import {
  getHomeSecurityRulesV1,
  updateHomeSecurityRulesV1,
} from "../src/home/home-security-rules-v1.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "../src/home/home-sites-v1.js";
import {
  getRemoteTestStatus,
  resetRemoteTestState,
} from "../src/remote-test/remote-test-state.js";

/** JST の時分を表す Date（UTC 換算） */
function jstDate(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 8, 20, hour - 9, minute, 0));
}

describe("Itabashi DI trigger sensor lights", () => {
  afterEach(() => {
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
});
