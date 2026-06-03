import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-google-oauth";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-google-oauth.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.GOOGLE_OAUTH_ENABLED = "false";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 561-580 Google OAuth business", () => {
  let token = "";

  before(async () => {
    closeDatabase();
    for (const p of [
      process.env.TISLY_DB_PATH!,
      `${process.env.TISLY_DB_PATH}-wal`,
      `${process.env.TISLY_DB_PATH}-shm`,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
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
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("GET status and auth-url in mock mode", async () => {
    const status = await request(app)
      .get("/api/business/google/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.mode, "mock");
    assert.equal(status.body.connected, true);

    const url = await request(app)
      .get("/api/business/google/auth-url")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(url.status, 200);
    assert.ok(url.body.url.includes("callback"));
  });

  it("POST callback and test", async () => {
    const cb = await request(app)
      .post("/api/business/google/callback")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "mock" });
    assert.equal(cb.status, 200);
    assert.equal(cb.body.ok, true);

    const test = await request(app)
      .post("/api/business/google/test")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(test.status, 200);
    assert.equal(test.body.ok, true);
  });
});
