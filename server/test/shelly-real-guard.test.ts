import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.SHELLY_MODE = "real";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-shelly-guard.db";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Shelly real mode guard", () => {
  after(() => closeDatabase());

  it("GET /api/shelly/status returns failure when no base url in real mode", async () => {
    const res = await request(app).get("/api/shelly/status");
    assert.equal(res.status, 200);
    assert.ok(res.body.fetchedAt);
    assert.equal(res.body.online, false);
    assert.match(res.body.connectionError ?? "", /SHELLY_BASE_URL|real接続失敗/);
  });

  it("POST reboot without confirm returns 403 in real mode", async () => {
    const res = await request(app).post("/api/shelly/reboot").send({});
    assert.equal(res.status, 403);
    assert.match(res.body.message, /confirm/i);
  });

  it("POST reboot with dryRun succeeds", async () => {
    const res = await request(app).post("/api/shelly/reboot").send({ dryRun: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.dryRun, true);
  });

  it("POST toggle without confirm returns 403", async () => {
    const res = await request(app).post("/api/shelly/toggle").send({ on: true });
    assert.equal(res.status, 403);
  });
});
