import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-deployment-kit-secret";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-deployment-kit.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

const dbPath = process.env.TISLY_DB_PATH;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";

describe("Phase 1001-1040 First Customer Deployment Kit", () => {
  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    assert.equal(login.status, 200);
    adminToken = login.body.token;
  });

  after(() => closeDatabase());

  it("GET /api/deployment-kit/status", async () => {
    const res = await request(app).get("/api/deployment-kit/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "1001-1040");
    assert.ok(res.body.kpi);
  });

  it("POST customer wizard generates TOMS code", async () => {
    const res = await request(app)
      .post("/api/deployment-kit/customers/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerName: "導入試験株式会社",
        siteName: "試験現場",
        address: "東京都",
        contactName: "試験太郎",
        phone: "03-1111-2222",
        email: "test@example.com",
      });
    assert.equal(res.status, 201);
    assert.match(res.body.customerCode, /^TOMS\d{3}$/);
    assert.ok(res.body.initialPassword);
    assert.ok(res.body.loginUsername);
  });

  it("POST site wizard with template", async () => {
    const codeRes = await request(app)
      .get("/api/deployment-kit/customers/next-code")
      .set("Authorization", `Bearer ${adminToken}`);
    const customerCode = codeRes.body.customerCode;

    await request(app)
      .post("/api/deployment-kit/customers/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerName: "現場試験", siteName: "本社", address: "大阪" });

    const res = await request(app)
      .post("/api/deployment-kit/sites/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerCode, siteType: "kodate", name: "戸建テスト" });
    assert.equal(res.status, 201);
    assert.ok(res.body.site.id);
    assert.ok(res.body.zones.length >= 1);
  });

  it("POST device provision + QR asset", async () => {
    const wiz = await request(app)
      .post("/api/deployment-kit/customers/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerName: "設備試験", siteName: "倉庫" });

    const site = await request(app)
      .post("/api/deployment-kit/sites/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerCode: wiz.body.customerCode, siteType: "warehouse" });

    const res = await request(app)
      .post("/api/deployment-kit/devices/provision")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerCode: wiz.body.customerCode,
        siteId: site.body.site.id,
        name: "倉庫ESP",
        location: "搬入口",
        kind: "ESP",
      });
    if (res.status !== 201) console.error("provision error", res.body);
    assert.equal(res.status, 201);
    assert.ok(res.body.assetId);
    assert.ok(res.body.qrDataUrl);

    const detail = await request(app).get(`/api/deployment-kit/assets/${res.body.assetId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.asset.deviceId, res.body.deviceId);
  });

  it("GET deployment checklist", async () => {
    const res = await request(app).get("/api/deployment-kit/checklist");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "1001-1040");
    assert.ok(res.body.items.length >= 9);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    assert.ok(ids.includes("power"));
    assert.ok(ids.includes("qr"));
    assert.ok(ids.includes("maintenance"));
  });

  it("GET /customer/new page", async () => {
    const res = await request(app).get("/customer/new");
    assert.equal(res.status, 200);
    assert.match(res.text, /新規顧客登録/);
  });

  it("GET /deployment/checklist page", async () => {
    const res = await request(app).get("/deployment/checklist");
    assert.equal(res.status, 200);
    assert.match(res.text, /導入チェックリスト/);
  });

  it("GET deployment KPI", async () => {
    const res = await request(app).get("/api/deployment-kit/kpi");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.customerCount === "number");
    assert.ok(typeof res.body.siteCount === "number");
    assert.ok(typeof res.body.deviceCount === "number");
    assert.ok(typeof res.body.maintenanceCount === "number");
    assert.ok(typeof res.body.monthlyContractCount === "number");
  });

  it("GET dashboard includes deployment KPI", async () => {
    const res = await request(app).get("/api/dashboard");
    assert.equal(res.status, 200);
    assert.ok(res.body.deploymentKpi);
    assert.ok(typeof res.body.summary.customerCount === "number");
  });
});
