import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-tenant-saas-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tenant-saas-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  normalizeCountryCodeV1,
  normalizeCurrencyV1,
  normalizePlanStatusV1,
  planStatusLabelV1,
  regionLabelV1,
} = await import("../src/tenant/tenant-saas-v1.js");

const app = createApp();

async function ownerLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.owner",
      password: "demo-remote-2026",
    });
}

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    });
}

describe("Tenant SaaS v1 — 組織・契約ステータス", () => {
  let ownerToken = "";

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
    getDatabase();
    const login = await ownerLogin();
    assert.equal(login.status, 200, login.body?.error);
    ownerToken = login.body.token;
  });

  after(() => closeDatabase());

  it("正規化ヘルパー: 国・通貨・契約", () => {
    assert.equal(normalizeCountryCodeV1("AU"), "AU");
    assert.equal(normalizeCountryCodeV1("xx"), "JP");
    assert.equal(normalizeCurrencyV1(undefined, "AU"), "AUD");
    assert.equal(normalizeCurrencyV1("JPY"), "JPY");
    assert.equal(normalizePlanStatusV1("trial"), "trial");
    assert.equal(normalizePlanStatusV1("canceled"), "canceled");
    assert.equal(planStatusLabelV1("active"), "稼働中");
    assert.equal(planStatusLabelV1("trial"), "試用期間中");
    assert.equal(regionLabelV1("JP"), "日本");
    assert.equal(regionLabelV1("AU"), "オーストラリア");
  });

  it("マイグレーションで customers / devices に SaaS 列がある", () => {
    const db = getDatabase();
    const customerCols = new Set(
      (db.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>).map(
        (r) => r.name
      )
    );
    for (const col of [
      "tenant_id",
      "country_code",
      "currency",
      "plan_status",
      "monthly_fee",
    ]) {
      assert.ok(customerCols.has(col), `customers.${col}`);
    }

    const deviceCols = new Set(
      (db.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>).map(
        (r) => r.name
      )
    );
    for (const col of [
      "tenant_id",
      "country_code",
      "currency",
      "plan_status",
      "monthly_fee",
    ]) {
      assert.ok(deviceCols.has(col), `devices.${col}`);
    }
  });

  it("既存顧客データが削除されず SaaS 列が埋まる", () => {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT customer_code, customer_name, tenant_id, country_code, currency,
                plan_status, monthly_fee
         FROM customers WHERE customer_code = 'TOMS001'`
      )
      .get() as {
      customer_code: string;
      customer_name: string;
      tenant_id: string;
      country_code: string;
      currency: string;
      plan_status: string;
      monthly_fee: number;
    };
    assert.equal(row.customer_code, "TOMS001");
    assert.ok(row.customer_name.includes("TOMS"));
    assert.ok(row.tenant_id);
    assert.equal(row.country_code, "JP");
    assert.equal(row.currency, "JPY");
    assert.equal(row.plan_status, "active");
    assert.ok(row.monthly_fee >= 0);
  });

  it("GET /settings-v1 に契約カードが含まれる", async () => {
    const res = await request(app).get("/settings-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("月額契約・設定エリア"));
    assert.ok(res.text.includes("tenant-saas-card"));
    assert.ok(res.text.includes("tenant-saas-plan"));
  });

  it("GET /api/tenant-saas/v1 — owner で契約ステータス取得", async () => {
    const res = await request(app)
      .get("/api/tenant-saas/v1")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(res.status, 200, res.body?.error);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.status.country_code, "JP");
    assert.equal(res.body.status.currency, "JPY");
    assert.equal(res.body.status.plan_status, "active");
    assert.equal(res.body.status.planStatusLabel, "稼働中");
    assert.equal(res.body.status.regionLabel, "日本");
    assert.ok(res.body.status.tenant_id);
    assert.ok(Array.isArray(res.body.devices));
  });

  it("PATCH /api/tenant-saas/v1 — AU / AUD / trial に更新", async () => {
    const res = await request(app)
      .patch("/api/tenant-saas/v1")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        country_code: "AU",
        currency: "AUD",
        plan_status: "trial",
        monthly_fee: 99,
      });
    assert.equal(res.status, 200, res.body?.error);
    assert.equal(res.body.status.country_code, "AU");
    assert.equal(res.body.status.currency, "AUD");
    assert.equal(res.body.status.plan_status, "trial");
    assert.equal(res.body.status.planStatusLabel, "試用期間中");
    assert.equal(res.body.status.regionLabel, "オーストラリア");
    assert.equal(res.body.status.monthly_fee, 99);

    // JP に戻して既存デモ状態を維持
    const revert = await request(app)
      .patch("/api/tenant-saas/v1")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        country_code: "JP",
        currency: "JPY",
        plan_status: "active",
        monthly_fee: 9800,
      });
    assert.equal(revert.status, 200);
  });

  it("surveyor は 403", async () => {
    const login = await surveyorLogin();
    const res = await request(app)
      .get("/api/tenant-saas/v1")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 403);
  });
});
