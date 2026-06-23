import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-customer-portal-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-portal-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef, buildCustomerPortalLandingV1, buildCustomerMonitoringViewV1 } =
  await import("../src/shared/customer/customer-portal-data-v1.js");
const { CUSTOMER_FORBIDDEN_WORDS_V1 } = await import(
  "../src/shared/customer/customer-labels-v1.js"
);
const { resolveCustomerBackUrlV1 } = await import(
  "../src/shared/navigation/customer-nav-v1.js"
);
const { TISLY_CUSTOMER_PWA_START_URL } = await import(
  "../src/shared/routes/tisly-routes-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const DEMO_SHARE = shareIdFromRef("DEMO-HOME-001");

const FORBIDDEN_DOM = CUSTOMER_FORBIDDEN_WORDS_V1.filter(
  (w) => !["API", "debug", "mock", "portal", "remote", "sync", "WS"].includes(w)
);

describe("Customer Portal V1 — Phase19 home UI", () => {
  it("landing API returns home with 6 cards", async () => {
    const res = await request(app).get("/api/customer-portal/v1/landing");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.home);
    assert.equal(res.body.home.title, "TiSLY お客様ページ");
    assert.ok(res.body.home.cards?.length >= 6);
    assert.ok(res.body.home.systemStatusLabel);
    assert.ok(res.body.home.lastCheckedAt);
  });

  it("/customer HTML has no /app links or forbidden words", async () => {
    const res = await request(app).get("/customer");
    assert.equal(res.status, 200);
    assert.match(res.text, /customer-v1\.js/);
    assert.match(res.text, /TiSLY お客様ページ/);
    assert.doesNotMatch(res.text, /href="\/app"/);
    for (const word of FORBIDDEN_DOM) {
      assert.doesNotMatch(res.text, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("manifest start_url is /customer", async () => {
    const res = await request(app).get("/manifest-customer-v1.webmanifest");
    assert.equal(res.status, 200);
    assert.equal(res.body.start_url, "/customer");
    assert.equal(res.body.scope, "/customer");
  });
});

describe("Customer Portal V1 — sub-routes HTTP 200", () => {
  const routes = [
    `/customer/project/${DEMO_SHARE}`,
    `/customer/document/${DEMO_SHARE}`,
    `/customer/monitoring/${DEMO_SHARE}`,
  ];

  for (const route of routes) {
    it(`${route} returns 200`, async () => {
      const res = await request(app).get(route);
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /href="\/app"/);
    });
  }
});

describe("Customer Portal V1 — /app separation", () => {
  it("customer nav never returns /app from /app referrer", () => {
    const back = resolveCustomerBackUrlV1({ referrerPath: "/app" });
    assert.equal(back, TISLY_CUSTOMER_PWA_START_URL);
  });

  it("customer nav stays in /customer zone", () => {
    const back = resolveCustomerBackUrlV1({
      referrerPath: `/customer/project/${DEMO_SHARE}`,
    });
    assert.match(back, /^\/customer/);
  });

  it("monitoring API has no technical fields", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/monitoring/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /QNAP|MQTT|WebDAV|projectId|mock|dashboard/i);
    assert.ok(Array.isArray(res.body.floors));
    assert.ok(res.body.systemStatusLabel);
  });

  it("project API includes customer documents", async () => {
    const res = await request(app).get(`/api/customer-portal/v1/project/${DEMO_SHARE}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.propertyName);
    assert.ok(Array.isArray(res.body.documents));
    assert.ok(Array.isArray(res.body.maintenanceItems));
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /QNAP|粗利|projectId|invoice_pdf/);
  });
});

describe("Customer Portal V1 — forbidden words in API", () => {
  it("landing and monitoring payloads are sanitized", () => {
    const landing = buildCustomerPortalLandingV1();
    const monitoring = buildCustomerMonitoringViewV1(DEMO_SHARE);
    const text = JSON.stringify({ landing, monitoring });
    assert.doesNotMatch(text, /QNAP|MQTT|WebDAV|projectId|App Hub|route-health/i);
  });
});

describe("Customer Portal V1 — legacy redirect", () => {
  it("/customer-portal redirects to /customer", async () => {
    const res = await request(app).get("/customer-portal").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/customer/);
  });
});

describe("Customer Portal V1 — assets", () => {
  it("customer-shared-v1.js exists", () => {
    assert.ok(fs.existsSync(path.join(publicDir, "js/customer-shared-v1.js")));
  });

  it("document viewer has no LINE button", () => {
    const html = fs.readFileSync(path.join(publicDir, "document-viewer-v1.html"), "utf-8");
    assert.doesNotMatch(html, /LINEで送る/);
  });

  it("customer document page has PDF and save buttons in JS", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-document-v1.js"), "utf-8");
    assert.match(js, /PDFにする/);
    assert.match(js, /btn-save/);
    assert.doesNotMatch(js, /history\.back/);
    assert.doesNotMatch(js, /LINE/);
  });

  it("service worker bumped to v2400-phase19", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2400-phase19/);
    assert.match(sw, /customer-shared-v1\.js/);
  });

  it("shared customer modules exist", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-labels-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-home-state-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-monitoring-state-v1.ts")));
  });
});

after(async () => {
  await closeDatabase();
});
