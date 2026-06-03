process.env.JWT_SECRET = "test-jwt-secret-32-characters-long!!";
process.env.ADMIN_USERNAME = "admin";
process.env.INGEST_SECRET = "test-ingest-secret";
process.env.SESSION_EXPIRES_MINUTES = "60";
process.env.REQUIRE_2FA = "false";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.NODE_ENV = "test";
process.env.TEST_LOGIN_RATE_MAX = "10";

import { hashPassword } from "../src/auth/password.js";

process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import { resetRateLimitsForTests } from "../src/security/rate-limit.js";
import { disableTotp } from "../src/auth/totp.js";

const app = createApp();

async function loginToken(): Promise<string> {
  resetRateLimitsForTests();
  disableTotp("admin-default");
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "testpass" });
  assert.equal(res.status, 200);
  return res.body.token as string;
}

before(() => {
  resetRateLimitsForTests();
  getDatabase();
  disableTotp("admin-default");
});

after(() => {
  resetRateLimitsForTests();
  disableTotp("admin-default");
});

describe("TiSLY Security (Phase 161-180)", () => {
  it("rejects unauthenticated admin API", async () => {
    const res = await request(app).get("/api/sites/templates");
    assert.equal(res.status, 401);
  });

  it("login succeeds with valid credentials", async () => {
    const token = await loginToken();
    assert.ok(token.length > 10);
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, "admin");
  });

  it("rejects wrong device secret on register", async () => {
    const res = await request(app)
      .post("/api/devices/register")
      .set("x-tisly-ingest-secret", "wrong")
      .send({ deviceId: "SEC-BAD-DEVICE" });
    assert.equal(res.status, 401);
  });

  it("accepts ingest secret on test event", async () => {
    const res = await request(app)
      .post("/api/test/event")
      .set("x-tisly-ingest-secret", "test-ingest-secret")
      .send({ message: "security test" });
    assert.equal(res.status, 201);
  });

  it("rejects wrong ingest secret on ingest", async () => {
    const res = await request(app)
      .post("/api/events/ingest")
      .set("x-tisly-ingest-secret", "wrong")
      .send({
        event_id: "sec-1",
        device_id: "X",
        event_type: "test",
        severity: "info",
        message: "x",
      });
    assert.equal(res.status, 401);
  });

  it("rejects expired TV pairing code", async () => {
    const db = getDatabase();
    const code = "999001";
    const expired = new Date(Date.now() - 60_000).toISOString();
    db.prepare("DELETE FROM tv_devices WHERE device_id = 'TV-EXP-TEST'").run();
    db.prepare(
      `INSERT INTO tv_devices (id, tenant_id, site_id, device_id, display_name, pairing_code, pairing_expires_at, status)
       VALUES ('tv-exp-test', 'default', NULL, 'TV-EXP-TEST', 'Test', ?, ?, 'pairing')`
    ).run(code, expired);

    const res = await request(app)
      .post("/api/tv/pairing/confirm")
      .send({ pairingCode: code, siteId: "e2e-site" });
    assert.equal(res.status, 410);
  });

  it("authenticated sites API works", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get("/api/sites/templates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.templates.length >= 1);
  });

  it("device secret validation after provision", async () => {
    const token = await loginToken();
    const siteRes = await request(app)
      .post("/api/sites/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Sec Site", templateId: "kodate" });
    const siteId = siteRes.body.site.id;
    const prov = await request(app)
      .post("/api/provisioning/devices")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId, deviceType: "gateway" });
    const { deviceId, secret } = prov.body;

    const bad = await request(app)
      .post("/api/devices/register")
      .set("x-tisly-device-id", deviceId)
      .set("x-tisly-device-secret", "bad-secret")
      .send({ deviceId });
    assert.equal(bad.status, 401);

    const ok = await request(app)
      .post("/api/devices/register")
      .set("x-tisly-device-id", deviceId)
      .set("x-tisly-device-secret", secret)
      .send({ deviceId, deviceType: "gateway" });
    assert.ok(ok.status === 200 || ok.status === 201);
  });

  it("rate limits auth login after many failures", async () => {
    process.env.TEST_LOGIN_RATE_MAX = "10";
    const { resetLoginLimiterForTests } = await import("../src/api/routes/auth.js");
    resetLoginLimiterForTests();
    resetRateLimitsForTests();
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "wrong-password" });
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    assert.equal(lastStatus, 429);
  });
});

after(() => {
  resetRateLimitsForTests();
});
