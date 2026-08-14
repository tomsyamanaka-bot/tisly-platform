import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

process.env.JWT_SECRET = "test-jwt-device-binding-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-device-binding-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } =
  await import("../src/db/database.js");
const { buildPracticalHubCards } =
  await import("../src/pwa/pwa-hub.js");
const { TISLY_INTERNAL_ROUTES_V1 } =
  await import("../src/shared/routes/tisly-routes-v1.js");

const app = createApp();
let token = "";
let propertyId = "";

describe("RP2350 QR property binding v1", () => {
  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // テストDBが無い場合は続行する。
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("serves the mobile scanner page from both routes", async () => {
    for (const path of [
      "/device-binding-v1",
      "/app/device-binding",
    ]) {
      const response = await request(app).get(path);
      assert.equal(response.status, 200, path);
      assert.match(response.text, /id="qr-reader"/);
      assert.match(response.text, /id="print-label"/);
    }
  });

  it("lists existing properties without changing them", async () => {
    const response = await request(app)
      .get("/api/device/properties")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(response.status, 200, response.body?.error);
    assert.ok(response.body.properties.length >= 1);
    propertyId = response.body.properties[0].propertyId;
    assert.equal(
      response.body.properties[0].connectionStatus,
      "unbound"
    );
  });

  it("binds a raw QR device ID and updates card state", async () => {
    const bind = await request(app)
      .post("/api/device/bind")
      .set("Authorization", `Bearer ${token}`)
      .send({
        property_id: propertyId,
        qrText: "TISLY-BOX-001",
      });
    assert.equal(bind.status, 201, bind.body?.error);
    assert.equal(bind.body.binding.deviceId, "TISLY-BOX-001");
    assert.equal(bind.body.binding.connectionStatus, "online");
    assert.equal(
      bind.body.property.statusLabel,
      "接続済み（オンライン）"
    );

    const listed = await request(app)
      .get("/api/device/properties")
      .set("Authorization", `Bearer ${token}`);
    const property = listed.body.properties.find(
      (item: { propertyId: string }) =>
        item.propertyId === propertyId
    );
    assert.equal(property.connectionStatus, "online");
    assert.equal(property.devices.length, 1);
  });

  it("is idempotent and never overwrites another property", async () => {
    const same = await request(app)
      .post("/api/device/bind")
      .set("Authorization", `Bearer ${token}`)
      .send({
        property_id: propertyId,
        device_id: "TISLY-BOX-001",
      });
    assert.equal(same.status, 201);

    const now = new Date().toISOString();
    getDatabase()
      .prepare(
        `INSERT INTO customer_portal_properties
         (property_id, customer_code, property_name, address,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "PROP-SECOND-TEST",
        "TOMS001",
        "つくばコーポ102号室",
        "つくば市",
        now,
        now
      );

    const conflict = await request(app)
      .post("/api/device/bind")
      .set("Authorization", `Bearer ${token}`)
      .send({
        property_id: "PROP-SECOND-TEST",
        device_id: "TISLY-BOX-001",
      });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.currentPropertyId, propertyId);

    const count = getDatabase()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM property_device_bindings_v1
         WHERE device_id = ?`
      )
      .get("TISLY-BOX-001") as { count: number };
    assert.equal(count.count, 1);
  });

  it("accepts JSON QR and rejects invalid IDs", async () => {
    const jsonQr = await request(app)
      .post("/api/device/bind")
      .set("Authorization", `Bearer ${token}`)
      .send({
        property_id: "PROP-SECOND-TEST",
        qrText: JSON.stringify({
          device_id: "TISLY-BOX-002",
          device_type: "RP2350",
        }),
      });
    assert.equal(jsonQr.status, 201, jsonQr.body?.error);
    assert.equal(jsonQr.body.binding.deviceId, "TISLY-BOX-002");

    const invalid = await request(app)
      .post("/api/device/bind")
      .set("Authorization", `Bearer ${token}`)
      .send({
        property_id: propertyId,
        device_id: "DROP TABLE devices",
      });
    assert.equal(invalid.status, 400);
  });

  it("generates a printable real QR data URL", async () => {
    const response = await request(app)
      .post("/api/device/qr")
      .set("Authorization", `Bearer ${token}`)
      .send({ device_id: "TISLY-BOX-003" });
    assert.equal(response.status, 200, response.body?.error);
    assert.equal(response.body.qrPayload, "TISLY-BOX-003");
    assert.match(response.body.qrDataUrl, /^data:image\/png;base64,/);
  });

  it("appends the hub card and canonical routes", () => {
    const cards = buildPracticalHubCards("manager");
    const card = cards.find(
      (item) => item.id === "device_binding_v1"
    );
    assert.equal(card?.url, "/device-binding-v1");
    const surveyorCard = buildPracticalHubCards("surveyor").find(
      (item) => item.id === "device_binding_v1"
    );
    assert.equal(surveyorCard?.statusLabel, "使えます");
    assert.equal(surveyorCard?.url, "/device-binding-v1");
    assert.ok(
      cards.some((item) => item.id === "gas_monitor_v1")
    );
    assert.ok(
      TISLY_INTERNAL_ROUTES_V1.some(
        (route) => route.path === "/device-binding-v1"
      )
    );
  });
});
