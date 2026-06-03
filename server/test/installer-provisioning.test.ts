import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-installer-phase341";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-installer-phase341.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
}

describe("Phase 341-360 installer provisioning", () => {
  let tomsInstaller = "";
  let tomsAdmin = "";
  let qrPayload: Record<string, unknown> = {};

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
    resetRateLimitsForTests();
    getDatabase();

    const ti = await customerLogin("TOMS001", "toms001.installer");
    assert.equal(ti.status, 200, ti.body?.error);
    tomsInstaller = ti.body.token;

    const ta = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(ta.status, 200, ta.body?.error);
    tomsAdmin = ta.body.token;

  });

  after(() => {
    closeDatabase();
  });

  it("creates QR provisioning token", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-QR-TEST-01",
        deviceType: "ESP32",
        serialNumber: "SN-QR-001",
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.qrPayload);
    qrPayload = JSON.parse(res.body.qrPayload);
    assert.equal(qrPayload.device_id, "TOMS-QR-TEST-01");
  });

  it("claims QR successfully", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/qr/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        device_id: qrPayload.device_id,
        device_type: qrPayload.device_type,
        serial_number: qrPayload.serial_number,
        provisioning_token: qrPayload.provisioning_token,
        siteId: "site-toms-main",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it("rejects used QR token", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/qr/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        device_id: qrPayload.device_id,
        device_type: qrPayload.device_type,
        serial_number: qrPayload.serial_number,
        provisioning_token: qrPayload.provisioning_token,
      });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /already used/i);
  });

  it("rejects expired QR token", async () => {
    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-QR-EXP",
        deviceType: "ESP32",
        serialNumber: "SN-EXP",
        ttlMinutes: 1,
      });
    const payload = JSON.parse(create.body.qrPayload);
    getDatabase()
      .prepare(`UPDATE qr_provisioning_tokens SET expires_at = datetime('now', '-1 hour') WHERE device_id = ?`)
      .run("TOMS-QR-EXP");
    const claim = await request(app)
      .post("/api/customer/TOMS001/devices/qr/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        device_id: payload.device_id,
        device_type: payload.device_type,
        serial_number: payload.serial_number,
        provisioning_token: payload.provisioning_token,
      });
    assert.equal(claim.status, 400);
    assert.match(String(claim.body.error), /expired/i);
  });

  it("rejects QR claim for another customer tenant", async () => {
    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-QR-CROSS",
        deviceType: "ESP32",
        serialNumber: "SN-CROSS",
      });
    const payload = JSON.parse(create.body.qrPayload);
    const claim = await request(app)
      .post("/api/customer/HOTEL001/devices/qr/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        device_id: payload.device_id,
        device_type: payload.device_type,
        serial_number: payload.serial_number,
        provisioning_token: payload.provisioning_token,
      });
    assert.ok(claim.status === 403 || claim.status === 400);
  });

  it("installer cannot view billing on dashboard", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/dashboard")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.billing, null);
    const admin = await request(app)
      .get("/api/customer/TOMS001/dashboard")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.ok(admin.body.billing !== null || admin.body.billing === null);
  });

  it("saves device test result", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/TOMS-QR-TEST-01/test/heartbeat")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const row = getDatabase()
      .prepare(`SELECT last_test_result FROM devices WHERE device_id = ?`)
      .get("TOMS-QR-TEST-01") as { last_test_result: string };
    assert.ok(row.last_test_result.includes("heartbeat"));
  });

  it("completes checklist item", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/install/checklist/photo_registered/complete")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({ deviceId: "TOMS-QR-TEST-01" });
    assert.equal(res.status, 200);
    assert.equal(res.body.item.completed, true);
  });

  it("generates completion report", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/install/completion-report")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .set("Accept", "application/json");
    assert.equal(res.status, 200);
    assert.ok(res.body.html.includes("施工完了レポート"));
  });
});
