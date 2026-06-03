import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-onboard-421";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-device-onboard-421.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");

const app = createApp();

async function installerLogin(code: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username: `${code.toLowerCase()}.installer`, password: "demo-remote-2026" });
}

describe("Phase 421-440 device onboarding wizard", () => {
  let token = "";
  const deviceId = "TOMS-ONBOARD-421";

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
    const login = await installerLogin("TOMS001");
    assert.equal(login.status, 200);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("wizard create → qr → claim → firmware → heartbeat → complete", async () => {
    const create = await request(app)
      .post("/api/customer/TOMS001/devices/onboard/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceId, deviceType: "ESP32", serialNumber: "SN-421" });
    assert.equal(create.status, 201);

    const qr = await request(app)
      .post("/api/customer/TOMS001/devices/onboard/qr")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceId, deviceType: "ESP32", serialNumber: "SN-421" });
    assert.equal(qr.status, 200);
    const payload = JSON.parse(qr.body.qrPayload);

    const claim = await request(app)
      .post("/api/customer/TOMS001/devices/onboard/claim")
      .set("Authorization", `Bearer ${token}`)
      .send({
        device_id: payload.device_id,
        device_type: payload.device_type,
        serial_number: payload.serial_number,
        provisioning_token: payload.provisioning_token,
      });
    assert.equal(claim.status, 200);

    const fw = await request(app)
      .get(`/api/customer/TOMS001/devices/${deviceId}/onboard/firmware`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(fw.status, 200);
    assert.ok(fw.body.firmware?.mqtt_topic);

    await request(app)
      .post("/api/customer/TOMS001/heartbeat")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceId, platform: "test" });

    const hb = await request(app)
      .post(`/api/customer/TOMS001/devices/${deviceId}/onboard/heartbeat-check`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(hb.status, 200);
    assert.equal(hb.body.ok, true);

    const done = await request(app)
      .post("/api/customer/TOMS001/devices/onboard/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceId });
    assert.equal(done.status, 200);
  });

  it("device timeline lists entries", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/devices/timeline")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
    assert.ok(res.body.entries.length >= 1);
  });
});
