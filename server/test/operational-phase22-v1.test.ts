import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase22";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase22.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef } = await import("../src/shared/customer/customer-portal-data-v1.js");
const { CUSTOMER_FORBIDDEN_WORDS_V1 } = await import(
  "../src/shared/customer/customer-labels-v1.js"
);
const {
  CUSTOMER_JS_VERSION_V1,
  CUSTOMER_SW_TOKEN_V1,
} = await import("../src/shared/customer/customer-cache-v1.ts");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const DEMO_SHARE = shareIdFromRef("DEMO-HOME-001");

const FORBIDDEN_DOM = CUSTOMER_FORBIDDEN_WORDS_V1.filter(
  (w) => !["API", "debug", "mock", "portal", "remote", "sync", "WS", "JSON"].includes(w)
);

describe("Operational Phase22 — customer routes 200", () => {
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

describe("Operational Phase22 — customer separation", () => {
  it("customer pages have no /app links", async () => {
    const routes = [
      "/customer",
      "/customer/TOMS001",
      `/customer/project/${DEMO_SHARE}`,
      `/customer/document/${DEMO_SHARE}`,
      `/customer/monitoring/${DEMO_SHARE}`,
    ];
    for (const route of routes) {
      const res = await request(app).get(route);
      assert.doesNotMatch(res.text, /href="\/app"/);
    }
  });

  it("customer pages have zero forbidden words in HTML shell", async () => {
    const routes = ["/customer", "/customer/TOMS001", `/customer/project/${DEMO_SHARE}`];
    for (const route of routes) {
      const res = await request(app).get(route);
      for (const word of FORBIDDEN_DOM) {
        assert.doesNotMatch(res.text, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }
  });

  it("manifest start_url is /customer", async () => {
    const res = await request(app).get("/manifest-customer-v1.webmanifest");
    assert.equal(res.status, 200);
    assert.equal(res.body.start_url, "/customer");
  });

  it("service worker is v2403-phase23", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, new RegExp(CUSTOMER_SW_TOKEN_V1));
    assert.match(sw, /isCustomerFreshAsset/);
  });

  it("customer cache module has phase22 version", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-cache-v1.js"), "utf-8");
    assert.match(js, new RegExp(CUSTOMER_JS_VERSION_V1));
    assert.match(js, new RegExp(CUSTOMER_SW_TOKEN_V1));
    assert.match(js, /performCustomerCacheRefresh/);
  });

  it("document viewer back stays in customer zone without LINE or history.back", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-document-v1.js"), "utf-8");
    assert.match(js, /\/customer\/project\//);
    assert.doesNotMatch(js, /history\.back/);
    assert.doesNotMatch(js, /LINE/);
  });

  it("project page has PDF view and save actions", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-project-v1.js"), "utf-8");
    const shared = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, /CUSTOMER_DOCUMENT_ACTIONS\.pdfView/);
    assert.match(shared, /PDFを見る/);
    assert.match(js, /btn-save/);
    assert.doesNotMatch(js, /history\.back/);
  });

  it("property list API includes status and last checked", async () => {
    const res = await request(app).get("/api/customer-portal/v1/home/TOMS001");
    assert.equal(res.status, 200);
    assert.ok(res.body.projects?.length >= 1);
    const p = res.body.projects[0];
    assert.ok(p.systemStatusLabel);
    assert.ok(p.lastCheckedAt);
    assert.equal(p.currentStatusLabel, "現在の状態");
    assert.equal(p.lastCheckedLabel, "最終確認");
  });

  it("monitoring API uses 最終確認 label", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/monitoring/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.lastDetectionLabel, "最終確認");
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /deviceId|sensorId|topic|mqtt|statusCode/i);
  });
});

after(async () => {
  await closeDatabase();
});
