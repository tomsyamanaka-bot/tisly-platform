/**
 * /customer Security 単体 + ポータルトグル v1
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-customer-portal-modules-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-portal-modules-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import(
  "../src/security/rate-limit.js"
);
const {
  buildModulesFromPortalTogglesV1,
  getCustomerPortalModulesV1,
  parsePortalCardTogglesV1,
  resolveDefaultCustomerPortalModulesV1,
} = await import("../src/shared/customer/customer-portal-modules-v1.js");
const { buildCustomerSessionHomeV1 } = await import(
  "../src/shared/customer/customer-portal-data-v1.js"
);
const { upsertEnabledModulesV1 } = await import(
  "../src/tenant/customer-enabled-modules-store-v1.js"
);

const app = createApp();

describe("customer portal modules v1 — Security default", () => {
  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    resetRateLimitsForTests();
    getDatabase();
  });

  after(() => closeDatabase());

  it("TOYOSHIMA001 defaults to Security + camera only", () => {
    const mods = resolveDefaultCustomerPortalModulesV1("TOYOSHIMA001");
    assert.ok(mods.includes("security_floor_v1"));
    assert.ok(mods.includes("camera_preview_v1"));
    assert.ok(!mods.includes("tisly_home_v1"));
  });

  it("buildModulesFromPortalToggles respects defaults", () => {
    const mods = buildModulesFromPortalTogglesV1({});
    assert.deepEqual(mods.sort(), [
      "camera_preview_v1",
      "customer_portal",
      "security_floor_v1",
    ]);
  });

  it("session home hides TiSLY HOME for TOYOSHIMA001", () => {
    const home = buildCustomerSessionHomeV1("TOYOSHIMA001");
    const ids = home.cards.map((c) => c.id);
    assert.ok(ids.includes("home_security"));
    assert.ok(ids.includes("camera"));
    assert.ok(!ids.includes("tisly_home"));
    assert.ok(!ids.includes("eco_water"));
  });

  it("TOMS toggle ON for HOME reflects immediately after save", () => {
    upsertEnabledModulesV1({
      customerCode: "TOYOSHIMA001",
      enabledModules: buildModulesFromPortalTogglesV1({
        security_floor_v1: true,
        tisly_home_v1: true,
        camera_preview_v1: true,
        equipment_monitor_v1: false,
      }),
      updatedBy: "test",
    });
    const home = buildCustomerSessionHomeV1("TOYOSHIMA001");
    const ids = home.cards.map((c) => c.id);
    assert.ok(ids.includes("tisly_home"));
    assert.ok(ids.includes("home_security"));
  });

  it("equipment monitor toggle shows eco/gas cards", () => {
    upsertEnabledModulesV1({
      customerCode: "TESTSEC001",
      enabledModules: buildModulesFromPortalTogglesV1({
        security_floor_v1: true,
        tisly_home_v1: false,
        camera_preview_v1: true,
        equipment_monitor_v1: true,
      }),
      updatedBy: "test",
    });
    const mods = getCustomerPortalModulesV1("TESTSEC001");
    const toggles = parsePortalCardTogglesV1(mods, "TESTSEC001");
    assert.equal(toggles.equipment_monitor_v1, true);
  });

  it("admin modules API returns 4 portal toggles", async () => {
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.admin",
        password: "demo-remote-2026",
      });
    const res = await request(app)
      .get("/api/customer-portal/v1/admin/accounts/modules")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.modules.length, 4);
    assert.ok(res.body.modules.some((m: { id: string }) => m.id === "security_floor_v1"));
  });
});
