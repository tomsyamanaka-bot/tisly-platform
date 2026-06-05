import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-shelly-prov-secret";
process.env.NODE_ENV = "test";
process.env.SHELLY_MODE = "mock";
process.env.TISLY_DB_PATH = "./data/test-shelly-provisioning.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

const dbPath = process.env.TISLY_DB_PATH;
const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";

describe("Phase 1051-1060 Shelly Provisioning", () => {
  let customerCode = "";
  let siteId = "";

  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    adminToken = login.body.token;

    const wiz = await request(app)
      .post("/api/deployment-kit/customers/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerName: "Shelly試験", siteName: "電源盤現場" });
    customerCode = wiz.body.customerCode;

    const site = await request(app)
      .post("/api/deployment-kit/sites/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerCode, siteType: "kodate" });
    siteId = site.body.site.id;
  });

  after(() => closeDatabase());

  it("GET /api/shelly/status includes provisioning phase", async () => {
    const res = await request(app).get("/api/shelly/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "mock");
    assert.ok(res.body.provisioning);
    assert.equal(res.body.provisioning.phase, "1051-1060");
  });

  it("POST /api/shelly/register mock success", async () => {
    const res = await request(app)
      .post("/api/shelly/register")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerCode,
        siteId,
        name: "遠隔電源",
        location: "1F 電源盤",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.mode, "mock");
    assert.ok(res.body.device.deviceId);
    assert.ok(res.body.device.assetId);
    assert.ok(res.body.shellyStatus.mock);
  });

  it("POST /api/shelly/test mock success", async () => {
    const res = await request(app).post("/api/shelly/test").send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.mock, true);
  });

  it("GET /api/demo-kit/sales/checklist shelly item ok in mock", async () => {
    const res = await request(app).get("/api/demo-kit/sales/checklist");
    assert.equal(res.status, 200);
    const shelly = res.body.items.find((i: { id: string }) => i.id === "shelly");
    assert.ok(shelly?.ok);
  });
});
