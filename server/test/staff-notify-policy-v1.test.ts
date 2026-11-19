import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  decideStaffNotifyV1,
  resetStaffNotifyPolicyForTestV1,
  setStaffCriticalEnabledV1,
  setStaffNormalAlwaysV1,
  setStaffTempNotifyV1,
} from "../src/notification/staff-notify-policy-v1.js";

const T0 = Date.parse("2026-11-19T05:00:00.000Z");
const ITABASHI = "SEC-JP-ITABASHI-LIVE";
const TOYOSHIMA = "SEC-JP-TOYOSHIMA-001";
const FUTURE = "HOME-JP-FUTURE-001";

describe("staff-notify-policy-v1", () => {
  it("always sends normal events for Itabashi", () => {
    resetStaffNotifyPolicyForTestV1();
    const home = decideStaffNotifyV1({
      siteId: "HOME-JP-ITABASHI-LIVE",
      eventType: "home_security_di1_perimeter",
      title: "駐車場センサーを検知",
      nowMs: T0,
      maintenanceActive: false,
    });
    const alias = decideStaffNotifyV1({
      siteId: "TOMS001",
      eventType: "home_security_di1_perimeter",
      title: "駐車場センサーを検知",
      nowMs: T0,
      maintenanceActive: false,
    });
    assert.equal(home.deliver, true);
    assert.equal(alias.deliver, true);
    assert.match(home.title, /^\[社内\] 板橋自宅：/);
    assert.equal(home.titleKind, "staff");
  });

  it("skips normal events for other sites by default", () => {
    resetStaffNotifyPolicyForTestV1();
    for (const siteId of [TOYOSHIMA, FUTURE]) {
      const decision = decideStaffNotifyV1({
        siteId,
        eventType: "toyoshima_sensor_alert",
        title: "センサーが反応しました",
        nowMs: T0,
        maintenanceActive: false,
      });
      assert.equal(decision.deliver, false, siteId);
    }
  });

  it("sends Toyoshima only during maintenance or the work timer", () => {
    resetStaffNotifyPolicyForTestV1();
    const during = decideStaffNotifyV1({
      siteId: TOYOSHIMA,
      eventType: "toyoshima_sensor_alert",
      title: "センサーが反応しました",
      nowMs: T0,
      maintenanceActive: true,
    });
    assert.equal(during.deliver, true);
    assert.match(during.title, /^\[社内・点検\] 豊島邸：/);
    const after = decideStaffNotifyV1({
      siteId: TOYOSHIMA,
      eventType: "toyoshima_sensor_alert",
      title: "センサーが反応しました",
      nowMs: T0,
      maintenanceActive: false,
    });
    assert.equal(after.deliver, false);

    setStaffTempNotifyV1(TOYOSHIMA, 30, T0);
    const open = decideStaffNotifyV1({
      siteId: TOYOSHIMA,
      eventType: "toyoshima_test_notify",
      title: "通知テスト",
      nowMs: T0 + 10 * 60 * 1000,
      maintenanceActive: false,
    });
    assert.equal(open.deliver, true);
    assert.match(open.title, /^\[社内・点検\] /);
    const closed = decideStaffNotifyV1({
      siteId: TOYOSHIMA,
      eventType: "toyoshima_test_notify",
      title: "通知テスト",
      nowMs: T0 + 31 * 60 * 1000,
      maintenanceActive: false,
    });
    assert.equal(closed.deliver, false);
  });

  it("still sends critical alerts when normal events are off", () => {
    resetStaffNotifyPolicyForTestV1();
    setStaffNormalAlwaysV1(TOYOSHIMA, false);
    const normal = decideStaffNotifyV1({
      siteId: TOYOSHIMA,
      eventType: "toyoshima_sensor_alert",
      title: "センサー",
      nowMs: T0,
      maintenanceActive: true,
    });
    assert.equal(normal.deliver, false);
    const critical = decideStaffNotifyV1({
      siteId: TOYOSHIMA,
      eventType: "ops_wdt_frequent",
      title: "再起動が続いています",
      nowMs: T0,
      maintenanceActive: false,
    });
    assert.equal(critical.deliver, true);
    assert.match(critical.title, /^\[社内\] 豊島邸：/);
    for (const eventType of [
      "toyoshima_comm_loss",
      "ops_cabinet_danger",
      "ops_sensor_flood",
    ]) {
      const row = decideStaffNotifyV1({
        siteId: FUTURE,
        eventType,
        title: "障害",
        nowMs: T0,
        maintenanceActive: false,
      });
      assert.equal(row.deliver, true, eventType);
    }
    setStaffCriticalEnabledV1(FUTURE, false);
    const muted = decideStaffNotifyV1({
      siteId: FUTURE,
      eventType: "ops_cabinet_danger",
      title: "高温",
      nowMs: T0,
      maintenanceActive: false,
    });
    assert.equal(muted.deliver, false);
  });

  it("keeps the staff notify card off the customer page", () => {
    const root = path.resolve("public");
    const staff = fs.readFileSync(
      path.join(root, "security-v1.html"),
      "utf8"
    );
    const customer = fs.readFileSync(
      path.join(root, "security-customer-v1.html"),
      "utf8"
    );
    assert.match(staff, /作業中のみ社内通知を受信/);
    assert.match(staff, /sf-staff-notify/);
    assert.doesNotMatch(customer, /作業中のみ社内通知を受信/);
    assert.doesNotMatch(customer, /sf-staff-notify/);
  });
});
