import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  deviceHealthViewV1,
  formatUptimeLabelV1,
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
    const third = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 900_000,
    });
    assert.match(third.staffAlert ?? "", /WDTリセットが3回以上/);
    assert.match(third.staffAlert ?? "", /板橋自宅/);
    const cooled = noteDeviceHealthV1({
      siteId: SITE,
      uptimeSec: 0,
      resetReason: "WDT",
      nowMs: T0 + 900_000 + 60 * 60 * 1000,
    });
    assert.equal(cooled.staffAlert, null);
    const view = deviceHealthViewV1(SITE, T0 + 900_000);
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
