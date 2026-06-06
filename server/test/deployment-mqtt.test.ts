import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-deployment-mqtt-secret";
process.env.NODE_ENV = "test";
process.env.MQTT_MODE = "mock";
process.env.TISLY_DB_PATH = "./data/test-deployment-mqtt.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

const dbPath = process.env.TISLY_DB_PATH;
const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";

describe("Phase 1041-1050 Deployment MQTT", () => {
  let customerCode = "";
  let deviceId = "";
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
      .send({ customerName: "MQTT試験", siteName: "試験現場" });
    customerCode = wiz.body.customerCode;

    const site = await request(app)
      .post("/api/deployment-kit/sites/wizard")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerCode, siteType: "kodate" });
    siteId = site.body.site.id;

    const dev = await request(app)
      .post("/api/deployment-kit/devices/provision")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerCode,
        siteId,
        name: "ESP試験",
        location: "1F",
        kind: "ESP",
      });
    deviceId = dev.body.deviceId;
  });

  after(() => closeDatabase());

  it("GET /api/deployment/mqtt/status returns mock mode", async () => {
    const res = await request(app)
      .get(`/api/deployment/mqtt/status?customerCode=${customerCode}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "mock");
    assert.equal(res.body.phase, "2251-2300");
    assert.ok(Array.isArray(res.body.devices));
    const dev = res.body.devices.find((d: { device_id: string }) => d.device_id === deviceId);
    assert.ok(dev);
    assert.ok(dev.mqtt_topic.includes(customerCode));
    assert.equal(dev.customer_code, customerCode);
    assert.ok(dev.site_id);
  });

  it("POST /api/deployment/mqtt/test-heartbeat mock success", async () => {
    const res = await request(app)
      .post("/api/deployment/mqtt/test-heartbeat")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ deviceId, customerCode, siteId });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.mock, true);
    assert.equal(res.body.device_id, deviceId);
    assert.ok(res.body.last_seen);
    assert.ok(res.body.mqtt_topic);
    assert.ok(!JSON.stringify(res.body).includes("password"));
  });
});
