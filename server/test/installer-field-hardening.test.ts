import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-installer-phase361";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-installer-phase361.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");
import { clearDryRunLogsForTests } from "../src/installer/dry-run.js";

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
}

describe("Phase 361-380 installer field hardening", () => {
  let tomsInstaller = "";
  let qrPayload: Record<string, unknown> = {};
  let deviceCountBeforeDry = 0;

  before(async () => {
    closeDatabase();
    clearDryRunLogsForTests();
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

    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-FIELD-QR-01",
        deviceType: "ESP32",
        serialNumber: "SN-FIELD-01",
      });
    qrPayload = JSON.parse(create.body.qrPayload);
  });

  after(() => {
    closeDatabase();
  });

  it("claims QR from scan-style payload", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/qr/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        device_id: qrPayload.device_id,
        device_type: qrPayload.device_type,
        serial_number: qrPayload.serial_number,
        provisioning_token: qrPayload.provisioning_token,
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it("claims NFC with UID", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/nfc/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({ nfcUid: "04:DE:AD:BE:EF" });
    assert.equal(res.status, 200);
    assert.ok(res.body.deviceId);
  });

  it("offline sync checklist is idempotent", async () => {
    const body = {
      entries: [
        {
          action: "checklist_complete",
          body: { deviceId: "TOMS-FIELD-QR-01", item: "photo_registered" },
        },
        {
          action: "checklist_complete",
          body: { deviceId: "TOMS-FIELD-QR-01", item: "photo_registered" },
        },
      ],
    };
    const res = await request(app)
      .post("/api/customer/TOMS001/install/sync")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send(body);
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, 2);
  });

  it("offline sync rejects duplicate QR claim", async () => {
    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-FIELD-QR-01",
        deviceType: "ESP32",
        serialNumber: "SN-FIELD-01",
      });
    const payload = JSON.parse(create.body.qrPayload);
    const res = await request(app)
      .post("/api/customer/TOMS001/install/sync")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        entries: [
          {
            action: "qr_claim",
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
    assert.equal(res.body.rejected, 1);
  });

  it("completion report HTML with format=html", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/install/completion-report?format=html")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /export_id/);
    assert.match(res.text, /施工完了レポート/);
  });

  it("label CSV export", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/devices/labels.csv")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /device_id,serial/);
  });

  it("label SVG export", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/devices/TOMS-FIELD-QR-01/label.svg")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.equal(res.status, 200);
    const body = typeof res.text === "string" ? res.text : String(res.body ?? "");
    assert.match(body, /<svg/);
  });

  it("dry run does not mutate device count on QR claim", async () => {
    const count = getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM devices WHERE customer_id = (SELECT customer_id FROM customers WHERE customer_code = 'TOMS001')`)
      .get() as { c: number };
    deviceCountBeforeDry = count.c;

    await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-DRY-RUN-99",
        deviceType: "ESP32",
        serialNumber: "SN-DRY",
      });

    const create = await request(app)
      .post("/api/customer/TOMS001/devices/qr/create")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({
        deviceId: "TOMS-DRY-RUN-99",
        deviceType: "ESP32",
        serialNumber: "SN-DRY",
      });
    const payload = JSON.parse(create.body.qrPayload);

    const dry = await request(app)
      .post("/api/customer/TOMS001/devices/qr/claim")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .set("X-TiSLY-Dry-Run", "1")
      .send({
        device_id: payload.device_id,
        device_type: payload.device_type,
        serial_number: payload.serial_number,
        provisioning_token: payload.provisioning_token,
      });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.dryRun, true);

    const after = getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM devices WHERE customer_id = (SELECT customer_id FROM customers WHERE customer_code = 'TOMS001')`)
      .get() as { c: number };
    assert.equal(after.c, deviceCountBeforeDry);
  });

  it("install session start and complete", async () => {
    const start = await request(app)
      .post("/api/customer/TOMS001/install/session/start")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({ siteId: "site-toms-main", mode: "live" });
    assert.equal(start.status, 201);
    assert.equal(start.body.status, "active");

    const complete = await request(app)
      .post("/api/customer/TOMS001/install/session/complete")
      .set("Authorization", `Bearer ${tomsInstaller}`)
      .send({ sessionId: start.body.id });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.status, "completed");

    const list = await request(app)
      .get("/api/customer/TOMS001/install/sessions")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.ok(list.body.sessions.length >= 1);
  });

  it("mqtt RTT test endpoint", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/devices/TOMS-FIELD-QR-01/test/mqtt-rtt")
      .set("Authorization", `Bearer ${tomsInstaller}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.roundTripMs != null || res.body.timeout);
  });

  it("installer audit log records QR claim", async () => {
    const rows = getDatabase()
      .prepare(`SELECT action FROM audit_logs WHERE action = 'installer.qr.claim' ORDER BY created_at DESC LIMIT 5`)
      .all() as Array<{ action: string }>;
    assert.ok(rows.length >= 1);
  });

  it("HOTEL001 and PLANT001 installer still login", async () => {
    for (const code of ["HOTEL001", "PLANT001"]) {
      const u = `${code.toLowerCase()}.installer`;
      const res = await customerLogin(code, u);
      assert.equal(res.status, 200, `${code} installer`);
    }
  });
});
