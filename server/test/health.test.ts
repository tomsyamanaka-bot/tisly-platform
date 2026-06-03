import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("Health API extended (Phase 221-240)", () => {
  it("GET /api/health/full matches extended payload", async () => {
    const res = await request(app).get("/api/health/full");
    assert.equal(res.status, 200);
    assert.equal(res.body.endpoint, "/api/health/full");
  });

  it("GET /api/health includes postgres redis mqtt tv qnap disk memory", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.ok(res.body.postgres);
    assert.ok(res.body.redis);
    assert.ok(res.body.mqtt);
    assert.ok(res.body.tv);
    assert.ok(res.body.qnap);
    assert.ok(res.body.disk);
    assert.ok(res.body.memory);
    assert.ok(Array.isArray(res.body.infrastructure));
    assert.equal(res.body.phase, "261-280-pro-remote-invite-reporting");
  });

  it("GET /health reflects new phase", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "261-280-pro-remote-invite-reporting");
    assert.ok(res.body.features.includes("totp-2fa-otplib"));
  });

  it("GET /api/dashboard includes infrastructureHealth", async () => {
    const res = await request(app).get("/api/dashboard");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.infrastructureHealth));
    const names = res.body.infrastructureHealth.map((c: { name: string }) => c.name);
    assert.ok(names.includes("DB"));
    assert.ok(names.includes("Redis"));
  });
});
