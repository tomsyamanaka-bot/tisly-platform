/**
 * Keep Rising の設定決定と日中テスト。
 * 他顧客からの保存は拒否する。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";

process.env.JWT_SECRET = "test-jwt-keeprising-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-keeprising-security-v1.db";
process.env.TISLY_REVIEW_SANDBOX = "0";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { signToken } = await import("../src/auth/jwt.js");
const { getDatabase } = await import("../src/db/database.js");
const {
  KEEPRISING_CUSTOMER_CODE_V1,
  KEEPRISING_USERNAME_V1,
} = await import("../src/customer/seed-keeprising001-v1.js");
const { resetKeepRisingSecurityStateForTestV1 } = await import(
  "../src/home/home-keeprising-security-v1.js"
);
const {
  resetKeepRisingSettingsForTestV1,
  isKeepRisingScheduleOpenV1,
  getKeepRisingCustomerSettingsV1,
} = await import("../src/home/home-keeprising-settings-v1.js");
const { resolveCustomerTenantProfileV1 } = await import(
  "../src/shared/customer/customer-tenant-profile-v1.js"
);
const { listTenantScopedSecuritySitesV1 } = await import(
  "../src/shared/customer/customer-security-sites-v1.js"
);

const app = createApp();

function token(code: string): string {
  const row = getDatabase()
    .prepare(
      `SELECT customer_id FROM customers
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(code) as { customer_id: string };
  return signToken({
    sub: `cu-${code}-owner`,
    username:
      code === "KEEPRISING001" ? KEEPRISING_USERNAME_V1 : "toyoshima001.owner",
    role: "owner",
    customerId: row.customer_id,
    customerCode: code,
    scope: "customer",
  }).token;
}

describe("keeprising security", () => {
  beforeEach(() => {
    resetKeepRisingSecurityStateForTestV1();
    resetKeepRisingSettingsForTestV1();
  });

  it("keeps the tenant on its own site", () => {
    getDatabase();
    const profile = resolveCustomerTenantProfileV1(KEEPRISING_CUSTOMER_CODE_V1);
    assert.equal(profile?.displayName, "Keep Rising");
    assert.equal(profile?.securitySiteId, "SEC-JP-KEEPRISING-001");
    assert.equal(profile?.homeSiteId, "HOME-JP-KEEPRISING");
    const sites = listTenantScopedSecuritySitesV1(KEEPRISING_CUSTOMER_CODE_V1);
    assert.equal(sites.length, 1);
    assert.equal(sites[0]?.siteId, "SEC-JP-KEEPRISING-001");
    assert.equal(
      sites.some((row) => String(row.siteId).includes("TOYOSHIMA")),
      false
    );
  });

  it("does not save until the confirm payload is stored", () => {
    const before = getKeepRisingCustomerSettingsV1();
    assert.equal(before.scheduleStart, "20:00");
    assert.equal(before.scheduleEnd, "06:00");
    assert.equal(before.durationSec, 30);
    assert.equal(before.floodModes.do1, "steady");
  });

  it("saves schedule, seconds, and flood modes only on PUT", async () => {
    const denied = await request(app)
      .put("/api/home/v1/keeprising/settings")
      .set("Authorization", `Bearer ${token("TOYOSHIMA001")}`)
      .send({ durationSec: 12, floodModes: { do1: "blink" } });
    assert.equal(denied.status, 403);

    const saved = await request(app)
      .put("/api/home/v1/keeprising/settings")
      .set("Authorization", `Bearer ${token("KEEPRISING001")}`)
      .send({
        scheduleStart: "21:30",
        scheduleEnd: "05:15",
        durationSec: 4,
        floodModes: { do1: "blink", do2: "steady", do3: "blink", do7: "steady" },
      });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.scheduleStart, "21:30");
    assert.equal(saved.body.settings.scheduleEnd, "05:15");
    assert.equal(saved.body.settings.durationSec, 5);
    assert.equal(saved.body.settings.floodModes.do1, "blink");
    assert.equal(saved.body.settings.floodModes.do3, "blink");
    assert.equal(saved.body.savedBy, "confirm");
  });

  it("queues the daytime sensor map and rejects other tenants", async () => {
    const denied = await request(app)
      .post("/api/home/v1/keeprising/day-test")
      .set("Authorization", `Bearer ${token("TOYOSHIMA001")}`)
      .send({ di: 4, confirmed: true });
    assert.equal(denied.status, 403);

    const unconfirmed = await request(app)
      .post("/api/home/v1/keeprising/day-test")
      .set("Authorization", `Bearer ${token("KEEPRISING001")}`)
      .send({ di: 4, confirmed: false });
    assert.equal(unconfirmed.status, 400);

    const test = await request(app)
      .post("/api/home/v1/keeprising/day-test")
      .set("Authorization", `Bearer ${token("KEEPRISING001")}`)
      .send({ di: 4, confirmed: true });
    assert.equal(test.status, 200);
    assert.deepEqual(test.body.channels, [1, 2, 3, 7, 4, 5]);

    const gate = await request(app)
      .post("/api/home/v1/keeprising/day-test")
      .set("Authorization", `Bearer ${token("KEEPRISING001")}`)
      .send({ di: 2, confirmed: true });
    assert.deepEqual(gate.body.channels, []);

    const command = await request(app).get("/api/home/v1/keeprising/command");
    assert.equal(command.body.command, "day_test");
    assert.equal(command.body.di, 4);
    const next = await request(app).get("/api/home/v1/keeprising/command");
    assert.equal(next.body.di, 2);
  });

  it("accepts a sensor event without queueing another relay", async () => {
    const event = await request(app)
      .post("/api/home/v1/keeprising/event")
      .send({
        di: 1,
        active: true,
        scheduleOpen: false,
        outputs: [],
        tenantId: "KEEPRISING001",
      });
    assert.equal(event.status, 200);
    assert.equal(event.body.linkedOutput, false);
    const command = await request(app).get("/api/home/v1/keeprising/command");
    assert.equal(command.body.command, null);
  });

  it("treats 20:00-06:00 as an overnight window", () => {
    const night = new Date("2026-01-01T12:00:00.000Z");
    const morning = new Date("2026-01-01T21:00:00.000Z");
    const day = new Date("2026-01-01T03:00:00.000Z");
    assert.equal(isKeepRisingScheduleOpenV1(night, "20:00", "06:00"), true);
    assert.equal(isKeepRisingScheduleOpenV1(morning, "20:00", "06:00"), false);
    assert.equal(isKeepRisingScheduleOpenV1(day, "20:00", "06:00"), false);
  });

  it("keeps the screen from saving on slider input", () => {
    const js = readFileSync(
      new URL(
        "../public/js/features/security/keeprising-customer-settings-v1.js",
        import.meta.url
      ),
      "utf8"
    );
    assert.match(js, /設定を決定する/);
    assert.match(js, /日中テスト発報/);
    assert.equal(js.includes("setTimeout"), false);
    const inputAt = js.indexOf('root.addEventListener("input"');
    const saveAt = js.indexOf("await saveSettings");
    assert.ok(inputAt > 0 && saveAt > inputAt);
    assert.equal(js.slice(inputAt, saveAt).includes("saveSettings"), false);
  });

  it("logs in Rising001 and keeps a single site without a selector", async () => {
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "Rising001",
        username: "kp-Rising001",
        password: "jdgmgwda3195",
      });
    assert.equal(login.status, 200, login.body?.error);
    assert.equal(
      String(login.body.user.customerCode).toUpperCase(),
      "RISING001"
    );
    const sites = await request(app)
      .get("/api/security-floor/v1/customer-sites")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(sites.status, 200);
    assert.equal(sites.headers["cache-control"]?.includes("no-store"), true);
    assert.equal(sites.body.sites.length, 1);
    assert.equal(sites.body.sites[0].siteId, "SEC-JP-KEEPRISING-001");
    assert.equal(sites.body.sites[0].displayName, "Keep Rising");
    const dash = await request(app)
      .get("/api/security-floor/v1/customer?siteId=SEC-JP-TOYOSHIMA-001")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(dash.body.dashboard.siteId, "SEC-JP-KEEPRISING-001");
    const home = await request(app)
      .get("/api/home/v1/customer?siteId=HOME-JP-TSUKUBA-001")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(home.body.dashboard.siteId, "HOME-JP-KEEPRISING");
    assert.equal(home.body.dashboard.displayName, "Keep Rising");
    assert.equal(home.body.dashboard.ct.mainCurrentA, 0);
    assert.equal(
      JSON.stringify(home.body.dashboard).includes("つくば"),
      false
    );
    const saved = await request(app)
      .put("/api/home/v1/keeprising/settings")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ durationSec: 40 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.durationSec, 40);
    const securityHtml = readFileSync(
      new URL("../public/security-customer-v1.html", import.meta.url),
      "utf8"
    );
    const homeHtml = readFileSync(
      new URL("../public/home-customer-v1.html", import.meta.url),
      "utf8"
    );
    assert.equal(securityHtml.includes('id="sf-site-select"'), false);
    assert.equal(homeHtml.includes('id="hm-site-select"'), false);
    assert.match(securityHtml, /sf-tenant-skeleton/);
  });

  it("stores guard mode and cabinet temperature without rewriting the night window", async () => {
    const owner = token("RISING001");
    const saved = await request(app)
      .put("/api/home/v1/keeprising/settings")
      .set("Authorization", `Bearer ${owner}`)
      .send({ guardMode: "home" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.guardMode, "home");
    assert.equal(saved.body.settings.scheduleStart, "20:00");
    assert.equal(saved.body.settings.scheduleEnd, "06:00");
    assert.equal(saved.body.settings.durationSec, 30);
    const notify = await request(app)
      .post("/api/home/v1/keeprising/event")
      .send({
        di: 1,
        active: true,
        scheduleOpen: true,
        outputs: [6],
      });
    assert.equal(notify.status, 200);
    assert.equal(notify.body.linkedOutput, false);
    assert.deepEqual(notify.body.channels, []);
    const off = await request(app)
      .put("/api/home/v1/keeprising/settings")
      .set("Authorization", `Bearer ${owner}`)
      .send({ guardMode: "disarmed" });
    assert.equal(off.body.settings.guardMode, "disarmed");
    assert.equal(off.body.settings.scheduleStart, "20:00");
    const stopped = await request(app)
      .post("/api/home/v1/keeprising/event")
      .send({
        di: 3,
        active: true,
        scheduleOpen: true,
        outputs: [1, 2, 4],
      });
    assert.equal(stopped.body.pushSent, false);
    assert.equal(stopped.body.linkedOutput, false);
    const beat = await request(app)
      .post("/api/home/v1/keeprising/heartbeat")
      .send({ deviceId: "rp2350-keeprising-main-01", cabinetTemp: 31.2 });
    assert.equal(beat.status, 200);
    const status = await request(app).get("/api/home/v1/keeprising/status");
    assert.equal(status.body.online, true);
    assert.equal(status.body.boardTempC, 31.2);
    assert.equal(status.body.cabinetTemp, 31.2);
    const customerJs = readFileSync(
      new URL(
        "../public/js/features/security/keeprising-customer-settings-v1.js",
        import.meta.url
      ),
      "utf8"
    );
    const assureJs = readFileSync(
      new URL(
        "../public/js/features/security/customer-assure-status-v1.js",
        import.meta.url
      ),
      "utf8"
    );
    assert.match(customerJs, /警戒 ON（外出警戒）/);
    assert.match(customerJs, /通知のみ/);
    assert.match(customerJs, /警戒 OFF（解除）/);
    assert.match(assureJs, /🟢 オンライン/);
    assert.match(assureJs, /24\.5/);
  });
});
