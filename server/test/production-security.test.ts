process.env.JWT_SECRET = "test-jwt-secret-32-characters-long!!";
process.env.ADMIN_USERNAME = "admin";
process.env.INGEST_SECRET = "test-ingest-secret";
process.env.SESSION_EXPIRES_MINUTES = "60";
process.env.REPLAY_PROTECTION_ENABLED = "true";
process.env.SIGNATURE_CHECK_ENABLED = "false";
process.env.REQUIRE_2FA = "false";
process.env.RATE_LIMIT_PROVIDER = "memory";

import { hashPassword } from "../src/auth/password.js";

process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import { resetRateLimitsForTests } from "../src/security/rate-limit.js";
import { resetReplayStoreForTests } from "../src/security/replay-protection.js";
import { disableTotp } from "../src/auth/totp.js";
import { hmacSha256 } from "../src/security/event-signature.js";

const app = createApp();

async function loginToken(): Promise<string> {
  resetRateLimitsForTests();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "testpass" });
  assert.equal(res.status, 200);
  return res.body.token as string;
}

function ingestHeaders(body: Record<string, unknown>) {
  return {
    "x-tisly-ingest-secret": "test-ingest-secret",
    "Content-Type": "application/json",
  };
}

before(() => {
  resetRateLimitsForTests();
  resetReplayStoreForTests();
  getDatabase();
  disableTotp("admin-default");
});

describe("TiSLY Production Security (Phase 181-200)", () => {
  it("duplicate event_id returns duplicate:true", async () => {
    const eventId = `dup-${Date.now()}`;
    const body = {
      event_id: eventId,
      site_id: "demo-test-site",
      device_id: "TEST-DEVICE-001",
      event_type: "test",
      severity: "info",
      message: "dup test",
    };
    const first = await request(app)
      .post("/api/test/event")
      .set(ingestHeaders(body))
      .send(body);
    assert.equal(first.status, 201);

    const second = await request(app)
      .post("/api/test/event")
      .set(ingestHeaders(body))
      .send(body);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.ok(second.body.id);
  });

  it("HMAC signature OK with device secret", async () => {
    const token = await loginToken();
    const siteRes = await request(app)
      .post("/api/sites/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "HMAC Site", templateId: "kodate" });
    const siteId = siteRes.body.site.id;
    const prov = await request(app)
      .post("/api/provisioning/devices")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId, deviceType: "gateway" });
    const { deviceId, secret } = prov.body;

    const body = {
      event_id: `hmac-ok-${Date.now()}`,
      tenant_id: "default",
      site_id: siteId,
      device_id: deviceId,
      event_type: "test",
      severity: "info",
      message: "hmac ok",
    };
    const rawBody = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = hmacSha256(secret, `${timestamp}.${rawBody}`);

    const res = await request(app)
      .post("/api/events/ingest")
      .set("x-tisly-device-id", deviceId)
      .set("x-tisly-device-secret", secret)
      .set("x-tisly-timestamp", timestamp)
      .set("x-tisly-signature", signature)
      .send(body);
    assert.equal(res.status, 201);
    assert.equal(res.body.duplicate, false);
  });

  it("HMAC signature NG returns 401", async () => {
    const body = {
      event_id: `hmac-bad-${Date.now()}`,
      device_id: "TEST-DEVICE-001",
      event_type: "test",
      severity: "info",
      message: "bad sig",
    };
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const res = await request(app)
      .post("/api/events/ingest")
      .set("x-tisly-ingest-secret", "test-ingest-secret")
      .set("x-tisly-device-id", "TEST-DEVICE-001")
      .set("x-tisly-timestamp", timestamp)
      .set("x-tisly-signature", "deadbeef".repeat(8))
      .send(body);
    assert.equal(res.status, 401);
  });

  it("timestamp too old returns 401", async () => {
    const body = {
      event_id: `hmac-old-${Date.now()}`,
      device_id: "TEST-DEVICE-001",
      event_type: "test",
      severity: "info",
      message: "old ts",
    };
    const rawBody = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000 - 600).toString();
    const signature = hmacSha256("dummy", `${timestamp}.${rawBody}`);
    const res = await request(app)
      .post("/api/events/ingest")
      .set("x-tisly-ingest-secret", "test-ingest-secret")
      .set("x-tisly-device-id", "TEST-DEVICE-001")
      .set("x-tisly-timestamp", timestamp)
      .set("x-tisly-signature", signature)
      .send(body);
    assert.equal(res.status, 401);
  });

  it("replay signature rejected", async () => {
    resetReplayStoreForTests();
    const token = await loginToken();
    const siteRes = await request(app)
      .post("/api/sites/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Replay Site", templateId: "kodate" });
    const siteId = siteRes.body.site.id;
    const prov = await request(app)
      .post("/api/provisioning/devices")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId, deviceType: "gateway" });
    const { deviceId, secret } = prov.body;

    const body = {
      event_id: `replay-${Date.now()}`,
      tenant_id: "default",
      site_id: siteId,
      device_id: deviceId,
      event_type: "test",
      severity: "info",
      message: "replay",
    };
    const rawBody = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = hmacSha256(secret, `${timestamp}.${rawBody}`);
    const headers = {
      "x-tisly-device-id": deviceId,
      "x-tisly-device-secret": secret,
      "x-tisly-timestamp": timestamp,
      "x-tisly-signature": signature,
    };

    const first = await request(app).post("/api/events/ingest").set(headers).send(body);
    assert.equal(first.status, 201);

    const second = await request(app).post("/api/events/ingest").set(headers).send(body);
    assert.equal(second.status, 409);
    assert.equal(second.body.replay, true);
  });

  it("session revoke invalidates token", async () => {
    const token = await loginToken();
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    ) as { jti: string };
    const sessionId = payload.jti;

    const revoke = await request(app)
      .post(`/api/auth/sessions/${sessionId}/revoke`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(revoke.status, 200);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(me.status, 401);
  });

  it("rate limit provider is memory", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.rate_limit_provider, "memory");
  });

  it("health includes production security fields", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.db_provider, "sqlite");
    assert.ok("session_store" in res.body);
    assert.ok("signature_check_enabled" in res.body);
    assert.ok("replay_protection_enabled" in res.body);
    assert.ok("siem_export_status" in res.body);
    assert.ok(res.body.components.security.ingestDuplicates !== undefined);
  });
});

after(() => {
  resetRateLimitsForTests();
  resetReplayStoreForTests();
});
