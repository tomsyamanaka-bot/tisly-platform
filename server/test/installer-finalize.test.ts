import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

process.env.JWT_SECRET = "test-installer-finalize-secret";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.MQTT_MODE = "mock";
process.env.SHELLY_MODE = "mock";
process.env.TISLY_DB_PATH = "./data/test-installer-finalize.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const dbPath = process.env.TISLY_DB_PATH;
const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");
const { hashPassword } = await import("../src/auth/password.js");

const app = createApp();
let adminToken = "";
let customerCode = "";

describe("Phase 1061-1070 Installer Finalize", () => {
  before(async () => {
    closeDatabase();
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    resetRateLimitsForTests();
    getDatabase();

    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    adminToken = login.body.token;

    const onboard = await request(app)
      .post("/api/customer-onboarding/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerName: "施工PWA試験",
        siteName: "施工現場",
        devices: [{ name: "ESP1", location: "1F", kind: "ESP" }],
      });
    customerCode = onboard.body.customer.customerCode;

    const espId = onboard.body.devices[0].deviceId;
    await request(app)
      .post("/api/deployment/mqtt/test-heartbeat")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ deviceId: espId, customerCode });
  });

  after(() => closeDatabase());

  it("GET field-checklist has 8 items with status labels", async () => {
    const res = await request(app)
      .get(`/api/customer/${customerCode}/install/field-checklist`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "1061-1070");
    assert.equal(res.body.items.length, 8);
    const labels = res.body.items.map((i: { statusLabel: string }) => i.statusLabel);
    assert.ok(labels.every((l: string) => ["未", "済", "要確認"].includes(l)));
    const ids = res.body.items.map((i: { id: string }) => i.id);
    assert.ok(ids.includes("esp_registered"));
    assert.ok(ids.includes("mqtt_heartbeat"));
    assert.ok(ids.includes("completion_report"));
  });

  it("PUT field-checklist item updates status", async () => {
    const res = await request(app)
      .put(`/api/customer/${customerCode}/install/field-checklist/google_tv`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "done" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "done");
    assert.equal(res.body.statusLabel, "済");
  });

  it("GET home-cards returns dashboard cards", async () => {
    const res = await request(app)
      .get(`/api/customer/${customerCode}/install/home-cards`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.todayWork);
    assert.ok(typeof res.body.incompleteCount === "number");
    assert.ok(typeof res.body.photoShortage === "number");
    assert.ok(typeof res.body.mqttUnconfirmed === "number");
    assert.ok(res.body.fieldChecklist);
  });

  it("GET install/home page has field checklist section", async () => {
    const res = await request(app).get(`/customer/${customerCode}/install/home`);
    assert.equal(res.status, 200);
    assert.match(res.text, /施工チェックリスト/);
    assert.match(res.text, /MQTT未確認/);
    assert.match(res.text, /Shelly未確認/);
  });
});
