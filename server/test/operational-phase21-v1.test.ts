import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase21";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase21.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef } = await import("../src/shared/customer/customer-portal-data-v1.js");
const { CUSTOMER_FORBIDDEN_WORDS_V1 } = await import(
  "../src/shared/customer/customer-labels-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const DEMO_SHARE = shareIdFromRef("DEMO-HOME-001");

const FORBIDDEN_DOM = CUSTOMER_FORBIDDEN_WORDS_V1.filter(
  (w) => !["API", "debug", "mock", "portal", "remote", "sync", "WS"].includes(w)
);

describe("Operational Phase21 — customer routes 200", () => {
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

describe("Operational Phase21 — customer separation", () => {
  it("customer pages have no /app links", async () => {
    const routes = ["/customer", "/customer/TOMS001", `/customer/project/${DEMO_SHARE}`];
    for (const route of routes) {
      const res = await request(app).get(route);
      assert.doesNotMatch(res.text, /href="\/app"/);
    }
  });

  it("customer pages have zero forbidden words in HTML shell", async () => {
    const res = await request(app).get("/customer");
    for (const word of FORBIDDEN_DOM) {
      assert.doesNotMatch(res.text, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("manifest start_url is /customer", async () => {
    const res = await request(app).get("/manifest-customer-v1.webmanifest");
    assert.equal(res.status, 200);
    assert.equal(res.body.start_url, "/customer");
  });

  it("service worker is v2401-phase21 or newer", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2401-phase21/);
  });

  it("document viewer back stays in customer zone", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-document-v1.js"), "utf-8");
    assert.match(js, /\/customer\/project\//);
    assert.doesNotMatch(js, /history\.back/);
    assert.doesNotMatch(js, /LINE/);
  });
});

after(async () => {
  await closeDatabase();
});
