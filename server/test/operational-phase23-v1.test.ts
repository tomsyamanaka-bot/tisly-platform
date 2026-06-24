import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase23";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase23.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef } = await import("../src/shared/customer/customer-portal-data-v1.js");
const {
  CUSTOMER_JS_VERSION_V1,
  CUSTOMER_SW_TOKEN_V1,
} = await import("../src/shared/customer/customer-cache-v1.ts");
const { getCustomerPortalStatsV1 } = await import(
  "../src/shared/customer/customer-data-service-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const DEMO_SHARE = shareIdFromRef("DEMO-HOME-001");

describe("Operational Phase23 — customer master integration", () => {
  it("stats API returns master/property/document counts", async () => {
    const stats = getCustomerPortalStatsV1();
    assert.ok(stats.customerMasterCount >= 1);
    assert.ok(stats.propertyCount >= 1);
    assert.equal(stats.apiStatus, "ok");

    const res = await request(app).get("/api/customer-portal/v1/stats");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.customerMasterCount >= 1);
    assert.ok(res.body.propertyCount >= 1);
  });

  it("TOMS001 home API uses master and contact actions", async () => {
    const res = await request(app).get("/api/customer-portal/v1/home/TOMS001");
    assert.equal(res.status, 200);
    assert.equal(res.body.customerName, "TOMS設備デモ");
    assert.ok(Array.isArray(res.body.projects));
    assert.ok(res.body.projects.length >= 1);
    assert.ok(Array.isArray(res.body.contactActions));
    assert.ok(res.body.contactActions.some((a: { id: string }) => a.id === "phone"));
    assert.ok(res.body.contactActions.some((a: { id: string }) => a.id === "email"));
    assert.ok(res.body.contactActions.some((a: { id: string }) => a.id === "form"));
  });

  it("project API resolves from property master", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/project/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.propertyName);
    assert.ok(Array.isArray(res.body.documents));
    assert.ok(Array.isArray(res.body.contactActions));
  });

  it("file API returns 404 for missing file", async () => {
    const res = await request(app).get(
      `/api/customer-portal/v1/file/${DEMO_SHARE}/doc-missing`
    );
    assert.equal(res.status, 404);
  });
});

describe("Operational Phase23 — customer routes 200", () => {
  const routes = [
    "/customer",
    "/customer/TOMS001",
    `/customer/project/${DEMO_SHARE}`,
    `/customer/document/${DEMO_SHARE}`,
    `/customer/monitoring/${DEMO_SHARE}`,
  ];

  for (const route of routes) {
    it(`${route} returns 200`, async () => {
      const res = await request(app).get(route);
      assert.equal(res.status, 200);
    });
  }
});

describe("Operational Phase23 — assets version", () => {
  it("service worker is v2405-phase25", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, new RegExp(CUSTOMER_SW_TOKEN_V1));
  });

  it("shared customer modules exist", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-master-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-property-master-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-data-service-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-files-v1.ts")));
  });

  it("customer-shared has contact actions bar", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, /renderContactActionsBar/);
    assert.match(js, new RegExp(CUSTOMER_JS_VERSION_V1));
  });
});

after(async () => {
  await closeDatabase();
});
