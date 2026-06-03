import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-installer-phase381";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-installer-phase381.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";
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

describe("Phase 381-400 installer production sync", () => {
  let installerToken = "";
  let viewerToken = "";
  let deviceId = "TOMS-PROD-SYNC-01";
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
    assert.equal(ti.status, 200);
    installerToken = ti.body.token;

    const tv = await customerLogin("TOMS001", "toms001.viewer");
    assert.equal(tv.status, 200);
    viewerToken = tv.body.token;

    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({ deviceId, deviceType: "ESP32", serialNumber: "SN-PROD-01" });
    qrPayload = JSON.parse(create.body.qrPayload);

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

  it("offline sync flush applies checklist", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/install/sync")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({
        entries: [
          {
            action: "checklist_complete",
            body: { deviceId, item: "photo_registered" },
          },
        ],
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.applied >= 1);
  });

  it("conflict handling returns conflict status for stale QR", async () => {
    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({ deviceId, deviceType: "ESP32", serialNumber: "SN-PROD-01" });
    const payload = JSON.parse(create.body.qrPayload);
    const res = await request(app)
      .post("/api/customer/TOMS001/install/sync")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({
        entries: [
          {
            action: "qr_claim",
            clientAt: "2000-01-01T00:00:00.000Z",
            body: {
              device_id: payload.device_id,
              device_type: payload.device_type,
              serial_number: payload.serial_number,
              provisioning_token: payload.provisioning_token,
            },
          },
        ],
      });
    assert.equal(res.status, 200);
    const conflict = (res.body.results ?? []).find((r: { status: string }) => r.status === "conflict");
    const rejected = (res.body.results ?? []).find((r: { status: string }) => r.status === "rejected");
    assert.ok(conflict || rejected);
  });

  it("mqtt rtt mock when MQTT_URL unset", async () => {
    const res = await request(app)
      .post(`/api/customer/TOMS001/devices/${deviceId}/test/mqtt-rtt`)
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.rtt_ms != null || res.body.roundTripMs != null);
    assert.equal(res.body.mock, true);
    assert.ok(res.body.topic);
    assert.ok(res.body.tested_at);
  });

  it("csr register and cert issue placeholder", async () => {
    const csr = await request(app)
      .post(`/api/customer/TOMS001/devices/${deviceId}/csr`)
      .set("Authorization", `Bearer ${installerToken}`)
      .send({ csrPem: "-----BEGIN CERTIFICATE REQUEST-----\nTEST\n-----END CERTIFICATE REQUEST-----" });
    assert.equal(csr.status, 201);
    assert.equal(csr.body.deviceId, deviceId);

    const issue = await request(app)
      .post(`/api/customer/TOMS001/devices/${deviceId}/cert/issue`)
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(issue.status, 200);
    assert.ok(issue.body.certPem);

    const status = await request(app)
      .get(`/api/customer/TOMS001/devices/${deviceId}/cert/status`)
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.csrRegistered, true);
  });

  it("photo upload list delete", async () => {
    const tiny = Buffer.from("ffd8ffe0", "hex").toString("base64");
    const up = await request(app)
      .post("/api/customer/TOMS001/install/photos/upload")
      .set("Authorization", `Bearer ${installerToken}`)
      .send({ deviceId, imageBase64: tiny, fileName: "test-prod.jpg" });
    assert.equal(up.status, 201);
    assert.ok(up.body.id);

    const list = await request(app)
      .get("/api/customer/TOMS001/install/photos")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.photos.length >= 1);

    const del = await request(app)
      .delete(`/api/customer/TOMS001/install/photos/${up.body.id}`)
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(del.status, 200);
  });

  it("label json svg csv", async () => {
    const json = await request(app)
      .get(`/api/customer/TOMS001/devices/${deviceId}/label.json`)
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(json.status, 200);
    assert.equal(json.body.device_id, deviceId);
    assert.ok(json.body.qr);

    const svg = await request(app)
      .get(`/api/customer/TOMS001/devices/${deviceId}/label.svg`)
      .set("Authorization", `Bearer ${viewerToken}`);
    const svgBody = typeof svg.text === "string" ? svg.text : String(svg.body ?? "");
    assert.match(svgBody, /<svg/);

    const csv = await request(app)
      .get("/api/customer/TOMS001/devices/labels.csv")
      .set("Authorization", `Bearer ${viewerToken}`);
    const csvBody = typeof csv.text === "string" ? csv.text : String(csv.body ?? "");
    assert.match(csvBody, /customer,site,zone/);
  });

  it("install dashboard stats", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/install/dashboard")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.registered === "number");
    assert.ok(typeof res.body.completionRate === "number");
  });

  it("installer role guard rejects viewer on csr post", async () => {
    const res = await request(app)
      .post(`/api/customer/TOMS001/devices/${deviceId}/csr`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ csrPem: "x" });
    assert.equal(res.status, 403);
  });

  it("audit log records cert issue", async () => {
    const rows = getDatabase()
      .prepare(`SELECT action FROM audit_logs WHERE action = 'installer.cert.issue' LIMIT 3`)
      .all() as Array<{ action: string }>;
    assert.ok(rows.length >= 1);
  });
});
