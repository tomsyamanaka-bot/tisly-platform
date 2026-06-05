import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-onboarding-secret";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-onboarding.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

const dbPath = process.env.TISLY_DB_PATH;
const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";

describe("Phase 1071-1080 Customer Onboarding", () => {
  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    adminToken = login.body.token;
  });

  after(() => closeDatabase());

  it("POST /api/customer-onboarding/create full flow", async () => {
    const res = await request(app)
      .post("/api/customer-onboarding/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerName: "一括導入試験株式会社",
        siteName: "つくば本社",
        plan: "PRO_REMOTE",
        address: "茨城県つくば市",
        siteType: "kodate",
        devices: [
          { name: "リビングESP", location: "1F リビング", kind: "ESP" },
          { name: "電源盤Shelly", location: "1F 電源盤", kind: "Shelly" },
        ],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.phase, "1071-1080");
    assert.match(res.body.customer.customerCode, /^TOMS\d{3}$/);
    assert.ok(res.body.site.id);
    assert.equal(res.body.devices.length, 2);
    assert.equal(res.body.qrLinks.length, 2);
    assert.ok(res.body.checklistUrl.includes("/deployment/checklist"));
    assert.ok(res.body.deployUrl.includes("/deploy"));
    assert.ok(res.body.installUrl.includes("/install/home"));
  });

  it("GET /onboarding/new page", async () => {
    const res = await request(app).get("/onboarding/new");
    assert.equal(res.status, 200);
    assert.match(res.text, /新規導入ウィザード/);
  });
});
