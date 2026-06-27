import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase26";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase26.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef } = await import("../src/shared/customer/customer-portal-data-v1.js");
const { classifyInspectionDeadlineV1 } = await import(
  "../src/shared/customer/customer-inspection-v1.js"
);
const {
  ensureCustomerPortalMastersV1,
  getCustomerPortalStatsV1,
  resetCustomerPortalMasterSyncV1,
} = await import("../src/shared/customer/customer-data-service-v1.js");
const { createBusinessProject } = await import("../src/business/business-store.js");
const { CUSTOMER_PORTAL_PLANS_V1 } = await import(
  "../src/shared/customer/customer-admin-api-v1.js"
);
const {
  CUSTOMER_JS_VERSION_V1,
  CUSTOMER_SW_TOKEN_V1,
} = await import("../src/shared/customer/customer-cache-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase26 — business_projects sync", () => {
  it("creates customer portal entities on business project create", async () => {
    resetCustomerPortalMasterSyncV1();
    const project = createBusinessProject({
      customerId: "BCU-TEST-PHASE26",
      customerName: "Phase26テスト顧客",
      title: "Phase26同期テスト物件",
      address: "守谷市テスト1-1",
      phone: "048-000-0000",
      municipality: "守谷市",
    });
    ensureCustomerPortalMastersV1();
    const stats = getCustomerPortalStatsV1();
    assert.ok(stats.propertyCount >= 1);
    const shareId = shareIdFromRef(project.projectNo);
    const res = await request(app).get(`/api/customer-portal/v1/project/${shareId}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.propertyName);
  });
});

describe("Operational Phase26 — inspection & plans", () => {
  it("classifies inspection deadlines", () => {
    const future = new Date();
    future.setDate(future.getDate() + 20);
    const s = classifyInspectionDeadlineV1(future.toISOString().slice(0, 10));
    assert.equal(s.color, "yellow");
    assert.equal(s.urgency, "warn30");
  });

  it("admin plans API lists contract plans", async () => {
    const res = await request(app).get("/api/customer-portal/v1/admin/plans");
    assert.equal(res.status, 200);
    for (const p of CUSTOMER_PORTAL_PLANS_V1) {
      assert.ok(res.body.plans.includes(p));
    }
  });
});

describe("Operational Phase26 — customer UI & share", () => {
  it("home API includes notifications and property fields", async () => {
    const res = await request(app).get("/api/customer-portal/v1/home/TOMS001");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.notifications));
    assert.ok(res.body.contractPlan);
    if (res.body.projects.length) {
      const p = res.body.projects[0];
      assert.ok("inspectionColor" in p || "contractPlan" in p);
    }
  });

  it("customer shared JS phase26", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, /customer-v1-phase27/);
    assert.match(js, /renderNotifications/);
    assert.match(js, /cv-inspection-/);
  });

  it("pdf-share uses files only", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/pdf-share-v1.js"), "utf-8");
    assert.ok(js.includes("navigatorShareFilesOnly"));
    assert.ok(js.includes("clearBlobUrlsFromPage"));
    assert.ok(!js.includes("navigator.share({ title, url"));
    assert.ok(!js.includes("navigator.share({ url"));
  });

  it("SW and cache version bumped", () => {
    assert.equal(CUSTOMER_JS_VERSION_V1, "customer-v1-phase27");
    assert.equal(CUSTOMER_SW_TOKEN_V1, "v2407-phase28");
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.ok(sw.includes(CUSTOMER_SW_TOKEN_V1));
  });
});

after(async () => {
  await closeDatabase();
});
