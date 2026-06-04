import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

process.env.SHELLY_MODE = "mock";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-shelly-e2e-lab.db";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Shelly real E2E lab", () => {
  after(() => closeDatabase());

  it("GET /api/demo-kit/shelly/lab-status mock", async () => {
    const res = await request(app).get("/api/demo-kit/shelly/lab-status");
    assert.equal(res.status, 200);
    assert.equal(res.body.envMode, "mock");
    assert.equal(res.body.online, true);
  });

  it("GET /api/shelly/status includes telemetry fields", async () => {
    const res = await request(app).get("/api/shelly/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.mock, true);
    assert.equal(res.body.online, true);
  });

  it("real mode without base reports connection error", async () => {
    process.env.SHELLY_MODE = "real";
    delete process.env.SHELLY_BASE_URL;
    const { fetchShellyDeviceStatus } = await import("../src/device/shelly-real-client.js");
    const status = await fetchShellyDeviceStatus();
    assert.equal(status.online, false);
    assert.match(status.connectionError ?? "", /real接続失敗/);
    process.env.SHELLY_MODE = "mock";
  });
});
