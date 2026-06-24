import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase24";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase24.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  CUSTOMER_JS_VERSION_V1,
  CUSTOMER_SW_TOKEN_V1,
} = await import("../src/shared/customer/customer-cache-v1.ts");
const { CUSTOMER_CONTACT_LABEL_V1 } = await import(
  "../src/shared/customer/customer-labels-v1.js"
);
const { TISLY_UI_LABELS_V1 } = await import("../src/shared/ui-models/labels-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase24 — TOMS notation", () => {
  it("customer contact label is TOMS", () => {
    assert.equal(CUSTOMER_CONTACT_LABEL_V1, "TOMSへ連絡");
  });

  it("bank account holder remains トムズ", () => {
    assert.equal(TISLY_UI_LABELS_V1.accountHolder, "トムズ");
  });

  it("TOMS001 home API uses TOMS設備デモ", async () => {
    const res = await request(app).get("/api/customer-portal/v1/home/TOMS001");
    assert.equal(res.status, 200);
    assert.equal(res.body.customerName, "TOMS設備デモ");
  });

  it("customer-shared uses TOMS contact label", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, /TOMSへ連絡/);
    assert.doesNotMatch(js, /トムズへ連絡/);
  });

  it("/customer-admin-v1 returns 200", async () => {
    const res = await request(app).get("/customer-admin-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /Customer Master 管理/);
  });

  it("admin list API returns customers and stats", async () => {
    const res = await request(app).get("/api/customer-portal/v1/admin/list");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(Array.isArray(res.body.customers));
    assert.ok(res.body.stats.customerMasterCount >= 1);
  });
});

describe("Operational Phase24 — assets", () => {
  it("service worker is v2405-phase25", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, new RegExp(CUSTOMER_SW_TOKEN_V1));
  });

  it("customer JS version is phase25", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-shared-v1.js"), "utf-8");
    assert.match(js, new RegExp(CUSTOMER_JS_VERSION_V1));
  });
});

after(async () => {
  await closeDatabase();
});
