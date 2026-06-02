import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";

const app = createApp();

before(() => {
  getDatabase();
});

describe("TiSLY E2E API (Phase 141-160 RC1)", () => {
  it("GET /health returns phase 141-160-rc1", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "141-160-rc1");
  });

  it("GET /api/sites/templates", async () => {
    const res = await request(app).get("/api/sites/templates");
    assert.equal(res.status, 200);
    assert.ok(res.body.templates.length >= 7);
  });

  it("POST /api/sites/create with template", async () => {
    const res = await request(app)
      .post("/api/sites/create")
      .send({ name: "E2E RC1 Site", templateId: "kodate" });
    assert.equal(res.status, 201);
    assert.ok(res.body.site.id);
    assert.ok(res.body.zones.length > 0);
  });

  it("POST /api/provisioning/devices", async () => {
    const site = await request(app)
      .post("/api/sites/create")
      .send({ name: "E2E Provision Site", templateId: "warehouse" });
    const siteId = site.body.site.id;
    const res = await request(app)
      .post("/api/provisioning/devices")
      .send({ siteId, deviceType: "gateway" });
    assert.equal(res.status, 201);
    assert.ok(res.body.deviceId);
    assert.ok(res.body.secret);
    assert.ok(res.body.qrDataUrl);
  });

  it("GET /api/health full", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.ok(res.body.components.server);
  });

  it("POST /api/devices/register", async () => {
    const res = await request(app)
      .post("/api/devices/register")
      .send({
        deviceId: "E2E-TEST-DEVICE",
        deviceType: "gateway",
        platform: "test",
        siteId: "e2e-site",
      });
    assert.ok(res.status === 201 || res.status === 200);
    assert.equal(res.body.deviceId, "E2E-TEST-DEVICE");
  });

  it("POST /api/test/event", async () => {
    const res = await request(app)
      .post("/api/test/event")
      .send({ message: "e2e test event" });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it("POST /api/test/alarm", async () => {
    const res = await request(app).post("/api/test/alarm").send({});
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it("POST /api/tv/pairing/start and confirm", async () => {
    const start = await request(app)
      .post("/api/tv/pairing/start")
      .send({ tvDeviceId: "E2E-TV-001" });
    assert.ok(start.status === 201 || start.status === 200);
    assert.match(start.body.pairingCode, /^\d{6}$/);

    const confirm = await request(app)
      .post("/api/tv/pairing/confirm")
      .send({
        pairingCode: start.body.pairingCode,
        siteId: "e2e-site",
        tvDeviceId: "E2E-TV-001",
      });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.ok, true);
    assert.equal(confirm.body.tv.siteId, "e2e-site");
  });

  it("GET /api/qnap/status", async () => {
    const res = await request(app).get("/api/qnap/status");
    assert.equal(res.status, 200);
    assert.ok(res.body);
  });
});

after(() => {
  /* keep db for local dev */
});
