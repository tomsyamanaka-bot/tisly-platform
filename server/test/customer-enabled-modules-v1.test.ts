/**
 * 顧客コード・テナント権限フィルター（enabledModules）
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = "test-jwt-customer-modules-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-modules-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import(
  "../src/security/rate-limit.js"
);
const {
  DEFAULT_ENABLED_MODULES_BY_CODE_V1,
  isInternalOpsCustomerV1,
  isModuleEnabledV1,
  resolveDefaultEnabledModulesV1,
} = await import("../src/tenant/customer-enabled-modules-v1.js");
const {
  getEnabledModulesForCustomerV1,
  upsertEnabledModulesV1,
} = await import("../src/tenant/customer-enabled-modules-store-v1.js");
const {
  buildPracticalHubCardsFiltered,
  showOpsPanelsForRole,
} = await import("../src/pwa/pwa-hub.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: code,
      username,
      password: "demo-remote-2026",
    });
}

describe("customer enabled modules / tenant filter v1", () => {
  let tomsAdmin = "";
  let hotelOwner = "";

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

    const ta = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(ta.status, 200, ta.body?.error);
    tomsAdmin = ta.body.token;

    const ho = await customerLogin("HOTEL001", "hotel001.owner");
    assert.equal(ho.status, 200, ho.body?.error);
    hotelOwner = ho.body.token;
  });

  after(() => closeDatabase());

  it("app-hub login label uses 顧客コード", () => {
    const html = fs.readFileSync(
      path.join(serverRoot, "public/app-hub.html"),
      "utf8"
    );
    assert.ok(html.includes("顧客コード"));
    assert.ok(html.includes("顧客コードとユーザー名で入ります"));
    assert.ok(!html.includes("会社コードとユーザー名で入ります"));
    assert.ok(html.includes('id="ops-panels-wrap" hidden'));
  });

  it("settings has module toggle card", () => {
    const html = fs.readFileSync(
      path.join(serverRoot, "public/settings-v1.html"),
      "utf8"
    );
    assert.ok(html.includes("customer-modules-card"));
    assert.ok(html.includes("利用機能（モジュール）"));
  });

  it("defaults: TOMS001 is all, HOTEL001 is home pack", () => {
    assert.deepEqual(
      resolveDefaultEnabledModulesV1("TOMS001"),
      DEFAULT_ENABLED_MODULES_BY_CODE_V1.TOMS001
    );
    assert.ok(
      resolveDefaultEnabledModulesV1("HOTEL001").includes(
        "tisly_home_v1"
      )
    );
    assert.ok(
      !resolveDefaultEnabledModulesV1("HOTEL001").includes(
        "security_floor_v1"
      )
    );
    assert.ok(
      resolveDefaultEnabledModulesV1("PLANT001").includes(
        "security_floor_v1"
      )
    );
    assert.ok(
      resolveDefaultEnabledModulesV1("CUST002").includes(
        "radar_settings_v1"
      )
    );
  });

  it("ops panels only for internal TOMS001", () => {
    assert.equal(isInternalOpsCustomerV1("TOMS001"), true);
    assert.equal(isInternalOpsCustomerV1("HOTEL001"), false);
    assert.equal(showOpsPanelsForRole("admin", "TOMS001"), true);
    assert.equal(showOpsPanelsForRole("admin", "HOTEL001"), false);
    assert.equal(showOpsPanelsForRole("viewer", "TOMS001"), false);
  });

  it("practical cards filter by enabledModules", () => {
    const all = buildPracticalHubCardsFiltered("admin", ["*"]);
    assert.ok(all.length >= 10);
    const homeOnly = buildPracticalHubCardsFiltered("admin", [
      "tisly_home_v1",
      "radar_settings_v1",
    ]);
    const ids = homeOnly.map((c) => c.id);
    assert.deepEqual(ids.sort(), [
      "radar_settings_v1",
      "tisly_home_v1",
    ]);
  });

  it("GET /api/customer-modules/v1 returns catalog", async () => {
    const res = await request(app)
      .get("/api/customer-modules/v1?customerCode=HOTEL001")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.customerCode, "HOTEL001");
    assert.ok(Array.isArray(res.body.catalog));
    assert.ok(res.body.catalog.length >= 5);
    assert.ok(res.body.enabledModules.includes("tisly_home_v1"));
  });

  it("PATCH enabledModules then hub filters for HOTEL001", async () => {
    const patch = await request(app)
      .patch("/api/customer-modules/v1")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({
        customerCode: "HOTEL001",
        enabledModules: [
          "tisly_home_v1",
          "radar_settings_v1",
          "customer_portal",
        ],
      });
    assert.equal(patch.status, 200, patch.body?.error);
    assert.ok(
      isModuleEnabledV1(patch.body.enabledModules, "tisly_home_v1")
    );

    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${hotelOwner}`);
    assert.equal(hub.status, 200);
    assert.equal(hub.body.showOpsPanels, false);
    const ids = (hub.body.practicalApps || []).map(
      (a: { id: string }) => a.id
    );
    assert.ok(ids.includes("tisly_home_v1"));
    assert.ok(ids.includes("radar_settings_v1"));
    assert.ok(!ids.includes("security_floor_v1"));
    assert.ok(!ids.includes("schedule_v1"));
    assert.deepEqual(hub.body.notifications || [], []);
    assert.equal(hub.body.operations, null);
  });

  it("TOMS001 admin hub hides ops and shows field practical apps only", async () => {
    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(hub.status, 200);
    assert.equal(hub.body.showOpsPanels, false);
    assert.equal(hub.body.showPracticalNav, true);
    assert.ok(
      (hub.body.practicalApps || []).some(
        (a: { id: string }) => a.id === "schedule_v1"
      )
    );
    assert.deepEqual(hub.body.notifications || [], []);
    assert.equal(hub.body.operations, null);
    assert.deepEqual(hub.body.workflows || [], []);
    assert.deepEqual(hub.body.apps || [], []);
    const ids = (hub.body.practicalApps || []).map(
      (a: { id: string }) => a.id
    );
    assert.ok(!ids.includes("survey_v1"));
    // 案件ダッシュボードは現場カードへ復旧
    assert.ok(ids.includes("project_dashboard_v1"));
    assert.ok(ids.includes("floorplan_builder_v1"));
    assert.ok(ids.includes("radar_settings_v1"));
    assert.ok(ids.includes("tisly_home_v1"));
  });

  it("HOTEL001 without business modules hides ops / workflows / practical nav", async () => {
    // PATCH 後も business 無しなら社内UIは出ない
    const mods = getEnabledModulesForCustomerV1("HOTEL001");
    assert.ok(!mods.includes("*"));
    assert.ok(!mods.includes("schedule_v1"));

    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${hotelOwner}`);
    assert.equal(hub.status, 200);
    assert.equal(hub.body.showOpsPanels, false);
    assert.equal(hub.body.showPracticalNav, false);
    assert.equal(hub.body.operations, null);
    assert.deepEqual(hub.body.workflows || [], []);
    assert.deepEqual(hub.body.notifications || [], []);
    const wfLabels = (hub.body.workflows || []).map(
      (w: { label: string }) => w.label
    );
    assert.ok(
      !wfLabels.some((l: string) => /Drawing|顧客台帳|TOMS KPI/i.test(l))
    );
  });

  it("customer_mgmt is portal category (not business)", async () => {
    const { MODULE_CATALOG_V1, hasBusinessModulesV1 } = await import(
      "../src/tenant/customer-enabled-modules-v1.js"
    );
    const mgmt = MODULE_CATALOG_V1.find((m) => m.id === "customer_mgmt");
    assert.equal(mgmt?.category, "portal");
    assert.equal(
      hasBusinessModulesV1(["customer_mgmt", "customer_portal"]),
      false
    );
  });

  it("store upsert persists modules", () => {
    upsertEnabledModulesV1({
      customerCode: "CUST002",
      enabledModules: ["tisly_home_v1", "demand_security_v1"],
      updatedBy: "test",
    });
    const mods = getEnabledModulesForCustomerV1("CUST002");
    assert.deepEqual(mods, [
      "tisly_home_v1",
      "demand_security_v1",
    ]);
  });
});
