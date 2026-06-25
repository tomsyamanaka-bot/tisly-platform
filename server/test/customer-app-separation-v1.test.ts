import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-customer-app-sep";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-app-sep.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { isValidReturnUrlV1, getNavZoneV1 } = await import(
  "../src/shared/navigation/tisly-navigation-stack-v1.js"
);

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

after(async () => {
  await closeDatabase();
});

describe("customer-app-separation-v1 — navigation zone", () => {
  it("customer cannot return to /app", () => {
    assert.equal(isValidReturnUrlV1("/app", "customer"), false);
    assert.equal(isValidReturnUrlV1("/customer", "customer"), true);
    assert.equal(isValidReturnUrlV1("/customer/project/x", "customer"), true);
  });

  it("internal cannot return to /customer", () => {
    assert.equal(isValidReturnUrlV1("/customer", "internal"), false);
    assert.equal(isValidReturnUrlV1("/estimate-v1", "internal"), true);
  });

  it("navigateTo blocks cross-zone in browser wrapper", () => {
    const navJs = fs.readFileSync(path.join(publicDir, "js/tisly-navigation-stack-v1.js"), "utf-8");
    assert.ok(navJs.includes("getNavZoneV1"));
    assert.ok(navJs.includes("toZone !== fromZone"));
  });
});

describe("customer-app-separation-v1 — HTML", () => {
  it("/customer has no /app links", async () => {
    const res = await request(app).get("/customer");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /href="\/app"/);
    assert.doesNotMatch(res.text, /見積作成/);
    assert.doesNotMatch(res.text, /発注管理/);
  });

  it("customer-nav stays in customer zone", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-nav-v1.js"), "utf-8");
    assert.ok(js.includes("CUSTOMER_FALLBACK"));
    assert.ok(js.includes("goCustomerBack"));
    assert.ok(js.includes("getDefaultNavFallbackV1"));
    assert.doesNotMatch(js, /navigateTo\("\/app"/);
  });

  it("customer manifest start_url is /customer", async () => {
    const res = await request(app).get("/manifest-customer-v1.webmanifest");
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text);
    assert.equal(body.start_url, "/customer");
    assert.equal(getNavZoneV1(body.start_url), "customer");
  });
});
