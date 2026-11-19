import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  cabinetViewV1,
  clearMaintenanceV1,
  maintenanceBlocksAutoRebootV1,
  maintenanceViewV1,
  markSensorCustomerPushV1,
  noteCabinetTempV1,
  observeSensorHitV1,
  resetOpsSafetyForTestV1,
  startMaintenanceV1,
} from "../src/home/home-ops-safety-v1.js";

const T0 = Date.parse("2026-11-19T03:00:00.000Z");
const SITE = "SEC-JP-TOYOSHIMA-001";

describe("home-ops-safety-v1", () => {
  it("maintenance ends itself when the timer passes", () => {
    resetOpsSafetyForTestV1();
    const started = startMaintenanceV1(SITE, 30, T0);
    assert.equal(started.active, true);
    assert.equal(started.remainingMin, 30);
    assert.match(started.banner, /点検中/);
    assert.match(started.banner, /自動復帰予定/);
    assert.equal(maintenanceBlocksAutoRebootV1("HOME-JP-TOYOSHIMA", T0 + 1000), true);
    const expired = maintenanceViewV1(SITE, T0 + 31 * 60_000);
    assert.equal(expired.active, false);
    assert.equal(maintenanceBlocksAutoRebootV1(SITE, T0 + 31 * 60_000), false);
    const cleared = clearMaintenanceV1(SITE, T0);
    assert.equal(cleared.active, false);
  });

  it("cools the same DI for 45 seconds and alerts staff at 10 hits", () => {
    resetOpsSafetyForTestV1();
    const first = observeSensorHitV1({
      siteId: SITE,
      di: 1,
      siteName: "豊島邸",
      nowMs: T0,
    });
    assert.equal(first.allowCustomerPush, true);
    markSensorCustomerPushV1(SITE, 1, T0);
    const cooled = observeSensorHitV1({
      siteId: "HOME-JP-TOYOSHIMA",
      di: 1,
      nowMs: T0 + 20_000,
    });
    assert.equal(cooled.reason, "cooldown");
    assert.equal(cooled.allowCustomerPush, false);
    const later = observeSensorHitV1({
      siteId: SITE,
      di: 1,
      nowMs: T0 + 46_000,
    });
    assert.equal(later.allowCustomerPush, true);

    resetOpsSafetyForTestV1();
    let flood = observeSensorHitV1({ siteId: SITE, di: 2, nowMs: T0 });
    for (let i = 1; i < 10; i += 1) {
      flood = observeSensorHitV1({
        siteId: SITE,
        di: 2,
        siteName: "豊島邸",
        nowMs: T0 + i * 1000,
      });
    }
    assert.equal(flood.reason, "flood");
    assert.equal(flood.allowCustomerPush, false);
    assert.match(flood.staffAlert?.title || "", /センサー異常疑い/);
    assert.match(flood.staffAlert?.title || "", /豊島邸/);
    assert.match(flood.staffAlert?.title || "", /DI2/);
    const again = observeSensorHitV1({
      siteId: SITE,
      di: 2,
      nowMs: T0 + 11_000,
    });
    assert.equal(again.staffAlert, null);
  });

  it("tags maintenance detections and keeps the customer push off", () => {
    resetOpsSafetyForTestV1();
    startMaintenanceV1("HOME-JP-ITABASHI-LIVE", 120, T0);
    const hit = observeSensorHitV1({
      siteId: "SEC-JP-ITABASHI-LIVE",
      di: 1,
      nowMs: T0 + 1000,
    });
    assert.equal(hit.reason, "maintenance");
    assert.equal(hit.allowCustomerPush, false);
    assert.match(hit.logMessage, /\[点検中\]/);
  });

  it("marks 55C caution and 65C danger with a 60 minute cooldown", () => {
    resetOpsSafetyForTestV1();
    const warm = noteCabinetTempV1({
      siteId: SITE,
      siteName: "豊島邸",
      tempC: 54.9,
      nowMs: T0,
    });
    assert.equal(warm.level, "normal");
    assert.equal(warm.staffPush, null);
    const caution = noteCabinetTempV1({
      siteId: SITE,
      siteName: "豊島邸",
      tempC: 55,
      nowMs: T0 + 1000,
    });
    assert.equal(caution.level, "caution");
    assert.equal(caution.badge, "⚠️ 高温注意");
    assert.match(caution.logMessage || "", /高温注意/);
    const again = noteCabinetTempV1({
      siteId: SITE,
      tempC: 64.9,
      nowMs: T0 + 2000,
    });
    assert.equal(again.level, "caution");
    assert.equal(again.logMessage, null);
    const danger = noteCabinetTempV1({
      siteId: SITE,
      siteName: "豊島邸",
      tempC: 65,
      nowMs: T0 + 3000,
    });
    assert.equal(danger.level, "danger");
    assert.equal(danger.badge, "🔥 高温警報");
    assert.match(danger.staffPush?.title || "", /盤内高温警報/);
    assert.match(danger.staffPush?.title || "", /65\.0℃/);
    const held = noteCabinetTempV1({
      siteId: SITE,
      tempC: 70,
      nowMs: T0 + 10 * 60_000,
    });
    assert.equal(held.staffPush, null);
    const later = noteCabinetTempV1({
      siteId: SITE,
      siteName: "豊島邸",
      tempC: 66,
      nowMs: T0 + 61 * 60_000,
    });
    assert.ok(later.staffPush);
    const view = cabinetViewV1("HOME-JP-TOYOSHIMA");
    assert.equal(view.badgeTone, "danger");
  });

  it("keeps the maintenance card off the customer page", () => {
    const publicDir = path.join(process.cwd(), "public");
    const staff = fs.readFileSync(
      path.join(publicDir, "security-v1.html"),
      "utf8"
    );
    const customer = fs.readFileSync(
      path.join(publicDir, "security-customer-v1.html"),
      "utf8"
    );
    assert.match(staff, /id="sf-ops-safety"/);
    assert.match(staff, /data-ops-minutes="30"/);
    assert.match(staff, /data-ops-minutes="0"/);
    assert.doesNotMatch(customer, /id="sf-ops-safety"/);
    assert.doesNotMatch(customer, /点検中モード/);
  });
});
