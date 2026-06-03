process.env.JWT_SECRET = "test-jwt-secret-32-characters-long!!";
process.env.ADMIN_USERNAME = "admin";
process.env.INGEST_SECRET = "e2e-ingest-secret";
process.env.REQUIRE_2FA = "false";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.NODE_ENV = "test";

import { hashPassword } from "../src/auth/password.js";

process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import { disableTotp } from "../src/auth/totp.js";
import { resetRateLimitsForTests } from "../src/security/rate-limit.js";

const app = createApp();

async function adminHeaders(): Promise<Record<string, string>> {
  resetRateLimitsForTests();
  disableTotp("admin-default");
  const login = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "testpass" });
  assert.equal(login.status, 200);
  return { Authorization: `Bearer ${login.body.token}` };
}

before(() => {
  getDatabase();
  disableTotp("admin-default");
  resetRateLimitsForTests();
});

describe("TiSLY E2E API (Phase 161-180 Security RC1)", () => {
  it("GET /health returns phase 261-280", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "421-440-first-device-commissioning");
  });

  it("GET /api/sites/templates requires auth", async () => {
    const denied = await request(app).get("/api/sites/templates");
    assert.equal(denied.status, 401);
    const auth = await adminHeaders();
    const res = await request(app).get("/api/sites/templates").set(auth);
    assert.equal(res.status, 200);
    assert.ok(res.body.templates.length >= 7);
  });

  it("POST /api/sites/create with template", async () => {
    const auth = await adminHeaders();
    const res = await request(app)
      .post("/api/sites/create")
      .set(auth)
      .send({ name: "E2E RC1 Site", templateId: "kodate" });
    assert.equal(res.status, 201);
    assert.ok(res.body.site.id);
    assert.ok(res.body.zones.length > 0);
  });

  it("POST /api/provisioning/devices", async () => {
    const auth = await adminHeaders();
    const site = await request(app)
      .post("/api/sites/create")
      .set(auth)
      .send({ name: "E2E Provision Site", templateId: "warehouse" });
    const siteId = site.body.site.id;
    const res = await request(app)
      .post("/api/provisioning/devices")
      .set(auth)
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
    assert.ok(res.body.components.auth);
  });

  it("POST /api/devices/register with ingest secret", async () => {
    const res = await request(app)
      .post("/api/devices/register")
      .set("x-tisly-ingest-secret", "e2e-ingest-secret")
      .send({
        deviceId: "E2E-TEST-DEVICE",
        deviceType: "gateway",
        platform: "test",
        siteId: "e2e-site",
      });
    assert.ok(res.status === 201 || res.status === 200);
    assert.equal(res.body.deviceId, "E2E-TEST-DEVICE");
  });

  it("POST /api/test/event with ingest secret", async () => {
    const res = await request(app)
      .post("/api/test/event")
      .set("x-tisly-ingest-secret", "e2e-ingest-secret")
      .send({ message: "e2e test event" });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it("POST /api/test/alarm with ingest secret", async () => {
    const res = await request(app)
      .post("/api/test/alarm")
      .set("x-tisly-ingest-secret", "e2e-ingest-secret")
      .send({});
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
    const auth = await adminHeaders();
    const res = await request(app).get("/api/qnap/status").set(auth);
    assert.equal(res.status, 200);
    assert.ok(res.body);
  });
});

after(() => {
  /* keep db for local dev */
});
