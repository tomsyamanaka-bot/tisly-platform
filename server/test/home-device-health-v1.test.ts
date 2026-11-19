import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  deviceHealthViewV1,
  formatUptimeLabelV1,
  migrateFalseRestartCountsV1,
  noteDeviceHealthV1,
  resetDeviceHealthForTestV1,
} from "../src/home/home-device-health-v1.js";

const T0 = Date.parse("2026-11-19T04:00:00.000Z");
const SITE = "SEC-JP-ITABASHI-LIVE";

describe("home-device-health-v1", () => {
  it("formats uptime and keeps a missing payload quiet", () => {
    resetDeviceHealthForTestV1();
    const day = 3 * 86400 + 14 * 3600 + 22 * 60;
    assert.equal(formatUptimeLabelV1(day), "3日 14時間22分");
    assert.equal(formatUptimeLabelV1(14 * 3600 + 22 * 60), "14時間22分");
    const quiet = noteDeviceHealthV1({
      siteId: SITE,
      nowMs: T0,
    });
    assert.equal(quiet.stored, false);
    assert.equal(quiet.staffAlert, null);
    const junk = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: "soon",
      resetReason: "",
      nowMs: T0,
    });
    assert.equal(junk.stored, false);
  });

  it("stores uptime and alerts staff on the third WDT boot", () => {
    resetDeviceHealthForTestV1();
    const first = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0,
    });
    assert.equal(first.staffAlert, null);
    noteDeviceHealthV1({
      siteId: "HOME-JP-ITABASHI-LIVE",
      uptimeSec: 300,
      resetReason: "WDT",
      nowMs: T0 + 300_000,
    });
    const second = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 600_000,
    });
    assert.equal(second.staffAlert, null);
    noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 300,
      resetReason: "WDT",
      nowMs: T0 + 900_000,
    });
    const third = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 1_200_000,
    });
    assert.match(third.staffAlert ?? "", /WDTリセットが3回以上/);
    assert.match(third.staffAlert ?? "", /板橋自宅/);
    noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 300,
      resetReason: "WDT",
      nowMs: T0 + 1_500_000,
    });
    const cooled = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 1_200_000 + 60 * 60 * 1000,
    });
    assert.equal(cooled.staffAlert, null);
    const view = deviceHealthViewV1(SITE, T0 + 1_200_000);
    assert.equal(view.wdtFrequent, true);
    assert.equal(view.badge, "⚠️ 再起動頻発");
    assert.equal(view.resetLabel, "WDT自動復旧");
  });

  it("counts short restarts and labels a normal power-on", () => {
    resetDeviceHealthForTestV1();
    const boot = (at: number) => {
      const started = noteDeviceHealthV1({
        siteId: "SEC-JP-TOYOSHIMA-001",
        uptimeSec: 0,
        resetReason: "PWRON",
        nowMs: at,
      });
      noteDeviceHealthV1({
        siteId: "HOME-JP-TOYOSHIMA",
        uptimeSec: 20,
        resetReason: "PWRON",
        nowMs: at + 20_000,
      });
      return started;
    };
    boot(T0);
    boot(T0 + 60_000);
    boot(T0 + 120_000);
    const fourth = boot(T0 + 180_000);
    assert.match(fourth.staffAlert ?? "", /起動直後の再起動が3回以上/);
    assert.match(fourth.staffAlert ?? "", /豊島邸/);
    const view = deviceHealthViewV1("SEC-JP-TOYOSHIMA-001", T0 + 200_000);
    assert.equal(view.resetLabel, "通常電源投入");
    assert.equal(view.uptimeLabel, "0分");
  });

  it("keeps one WDT count while uptime keeps rising", () => {
    resetDeviceHealthForTestV1();
    for (let i = 0; i < 5; i += 1) {
      const beat = noteDeviceHealthV1({
        siteId: SITE,
        uptimeSec: i * 300,
        resetReason: "WDT",
        nowMs: T0 + i * 300_000,
      });
      assert.equal(beat.staffAlert, null);
    }
    const rising = deviceHealthViewV1(SITE, T0 + 1_200_000);
    assert.equal(rising.wdtFrequent, false);
    assert.equal(rising.badge, null);
    const second = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 1_800_000,
    });
    assert.equal(second.staffAlert, null);
    noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 300,
      resetReason: "WDT",
      nowMs: T0 + 2_100_000,
    });
    const third = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 2_400_000,
    });
    assert.match(third.staffAlert ?? "", /WDTリセットが3回以上/);
    assert.equal(
      deviceHealthViewV1(SITE, T0 + 2_400_000).wdtFrequent,
      true
    );
  });

  it("does not count an OTA reboot toward WDT restarts", () => {
    resetDeviceHealthForTestV1();
    noteDeviceHealthV1({
      siteId: "SEC-JP-TOYOSHIMA-001",
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0,
    });
    noteDeviceHealthV1({
      siteId: "HOME-JP-TOYOSHIMA",
      uptimeSec: 900,
      resetReason: "WDT",
      nowMs: T0 + 900_000,
    });
    for (let i = 0; i < 3; i += 1) {
      const ota = noteDeviceHealthV1({
        siteId: "SEC-JP-TOYOSHIMA-001",
        uptimeSec: 0,
        resetReason: "OTA",
        nowMs: T0 + 1_200_000 + i * 600_000,
      });
      assert.equal(ota.staffAlert, null);
      noteDeviceHealthV1({
        siteId: "HOME-JP-TOYOSHIMA",
        uptimeSec: 120,
        resetReason: "OTA",
        nowMs: T0 + 1_320_000 + i * 600_000,
      });
    }
    const view = deviceHealthViewV1(
      "SEC-JP-TOYOSHIMA-001",
      T0 + 3_000_000
    );
    assert.equal(view.resetLabel, "OTA更新");
    assert.equal(view.wdtFrequent, false);
    assert.equal(view.badge, null);
  });

  it("clears the false restart counts for Itabashi and Toyoshima", () => {
    const state = {
      schemaVersion: 0,
      slots: {
        "HOME-JP-ITABASHI-LIVE": {
          bootKey: 1,
          uptimeSec: 4000,
          maxUptimeSec: 4000,
          resetReason: "WDT",
          events: [
            { at: 1, kind: "wdt" as const },
            { at: 2, kind: "wdt" as const },
            { at: 3, kind: "wdt" as const },
          ],
          lastAlertMs: 99,
          history: [],
          seenCuts: [],
        },
        "HOME-JP-TOYOSHIMA": {
          bootKey: 2,
          uptimeSec: 2500,
          maxUptimeSec: 2500,
          resetReason: "WDT",
          events: [
            { at: 4, kind: "wdt" as const },
            { at: 5, kind: "wdt" as const },
          ],
          lastAlertMs: 80,
          history: [],
          seenCuts: ["keep"],
        },
        "HOME-JP-RYUGASAKI": {
          bootKey: 3,
          uptimeSec: 100,
          maxUptimeSec: 100,
          resetReason: "PWRON",
          events: [{ at: 6, kind: "wdt" as const }],
          lastAlertMs: 1,
          history: [],
          seenCuts: [],
        },
      },
    };
    assert.equal(migrateFalseRestartCountsV1(state), true);
    assert.equal(state.slots["HOME-JP-ITABASHI-LIVE"].events.length, 0);
    assert.equal(state.slots["HOME-JP-ITABASHI-LIVE"].uptimeSec, 4000);
    assert.equal(state.slots["HOME-JP-ITABASHI-LIVE"].resetReason, "WDT");
    assert.equal(state.slots["HOME-JP-ITABASHI-LIVE"].lastAlertMs, 0);
    assert.equal(state.slots["HOME-JP-TOYOSHIMA"].events.length, 0);
    assert.equal(state.slots["HOME-JP-TOYOSHIMA"].uptimeSec, 2500);
    assert.deepEqual(state.slots["HOME-JP-TOYOSHIMA"].seenCuts, ["keep"]);
    assert.equal(state.slots["HOME-JP-RYUGASAKI"].events.length, 1);
    assert.equal(state.schemaVersion, 2);
    assert.equal(migrateFalseRestartCountsV1(state), false);
    assert.equal(state.slots["HOME-JP-RYUGASAKI"].events.length, 1);
  });

  it("keeps uptime off the customer page", () => {
    const root = path.resolve("public");
    const staff = fs.readFileSync(
      path.join(root, "security-v1.html"),
      "utf8"
    );
    const customer = fs.readFileSync(
      path.join(root, "security-customer-v1.html"),
      "utf8"
    );
    assert.match(staff, /連続稼働時間/);
    assert.match(staff, /前回起動理由/);
    assert.doesNotMatch(customer, /連続稼働時間/);
    assert.doesNotMatch(customer, /前回起動理由/);
    assert.doesNotMatch(customer, /sf-ops-safety/);
  });
});
