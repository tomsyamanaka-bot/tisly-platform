import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-field-live-401";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-installer-phase401.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";
process.env.FIELD_LIVE_MODE = "false";
process.env.MQTT_ACK_REQUIRED = "false";
process.env.CERT_PROVISIONING_MODE = "mock";
process.env.STORAGE_PROVIDER = "local";
delete process.env.MQTT_URL;

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

describe("Phase 401-420 field live connection", () => {
  let installerToken = "";
  let viewerToken = "";
  let deviceId = "TOMS-FIELD-LIVE-01";

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
    assert.equal(ti.status, 200);
    installerToken = ti.body.token;

    const tv = await customerLogin("TOMS001", "toms001.viewer");
    assert.equal(tv.status, 200);
    viewerToken = tv.body.token;

    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({ deviceId, deviceType: "ESP32", serialNumber: "SN-FIELD-01" });
    const qrPayload = JSON.parse(create.body.qrPayload);
    await request(app)
      .post("/api/customer/TOMS001/devices/qr/claim")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({
        device_id: qrPayload.device_id,
        device_type: qrPayload.device_type,
        serial_number: qrPayload.serial_number,
        provisioning_token: qrPayload.provisioning_token,
      });
  });

  after(() => closeDatabase());

  it("field live mode status", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/install/field-live-status")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.field_live_mode, false);
    assert.equal(res.body.cert_provisioning_mode, "mock");
    assert.equal(res.body.storage_provider, "local");
  });

  it("firmware config export", async () => {
    const res = await request(app)
      .get(`/api/customer/TOMS001/devices/${deviceId}/firmware-config`)
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.device_id, deviceId);
    assert.ok(res.body.mqtt_topic);
    assert.ok(res.body.cert_placeholder.includes("CERTIFICATE"));
    assert.ok(res.body.endpoint);
    assert.ok(res.body.heartbeat_interval_sec > 0);
  });

  it("live mqtt mock ack", async () => {
    const res = await request(app)
      .post(`/api/customer/TOMS001/devices/${deviceId}/test/live-mqtt`)
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.rtt_ms != null);
    assert.equal(res.body.mock, true);
  });

  it("label tepra csv", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/devices/labels/tepra.csv")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /tape_width_mm/);
    assert.ok(res.text.includes(deviceId));
  });

  it("label brother csv", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/devices/labels/brother.csv")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /ObjectName/);
    assert.ok(res.text.includes(deviceId));
  });

  it("completion report ja/en", async () => {
    const ja = await request(app)
      .get("/api/customer/TOMS001/install/completion-report?locale=ja")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(ja.status, 200);
    assert.match(ja.text, /現場セットアップ完了レポート/);

    const en = await request(app)
      .get("/api/customer/TOMS001/install/completion-report?locale=en")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(en.status, 200);
    assert.match(en.text, /Field Installation Completion Report/);
  });

  it("photo types save", async () => {
    const tiny = Buffer.from("fake-jpeg").toString("base64");
    const res = await request(app)
      .post("/api/customer/TOMS001/install/photos/upload")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({
        deviceId,
        photoType: "wiring",
        imageBase64: tiny,
        fileName: "wiring-test.jpg",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.photoType, "wiring");

    const bad = await request(app)
      .post("/api/customer/TOMS001/install/photos/upload")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({
        deviceId,
        photoType: "invalid_type",
        imageBase64: tiny,
      });
    assert.equal(bad.status, 400);
  });

  it("qr svg export", async () => {
    const res = await request(app)
      .get(`/api/customer/TOMS001/devices/${deviceId}/qr.svg`)
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const body = typeof res.text === "string" && res.text.length ? res.text : String(res.body ?? "");
    assert.match(body, /<svg/);
  });

  it("offline mqtt_test_result sync", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/install/sync")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({
        entries: [
          {
            action: "mqtt_test_result",
            body: { deviceId, rtt_ms: 77, mock: true },
          },
        ],
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.applied >= 1);
  });
});
