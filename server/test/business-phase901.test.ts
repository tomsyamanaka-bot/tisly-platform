import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-901";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-901.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 901-940 live device bridge RC1", () => {
  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const reset = await request(app).post("/api/demo-kit/reset");
    assert.equal(reset.status, 200);
  });

  after(() => closeDatabase());

  it("GET /api/demo-kit/status returns phase 901-940 and deviceMode", async () => {
    const res = await request(app).get("/api/demo-kit/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "901-940");
    assert.ok(res.body.deviceMode);
    assert.ok(res.body.deviceBridge);
    assert.ok(res.body.espHeartbeat);
  });

  it("PUT device-mode switches to mixed", async () => {
    const res = await request(app).put("/api/demo-kit/device-mode").send({ deviceMode: "mixed" });
    assert.equal(res.status, 200);
    assert.equal(res.body.deviceMode, "mixed");
  });

  it("GET devices/registry lists devices", async () => {
    const res = await request(app).get("/api/demo-kit/devices/registry");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "901-940");
    assert.ok(Array.isArray(res.body.devices));
  });

  it("PUT shelly config and GET telemetry", async () => {
    const put = await request(app)
      .put("/api/demo-kit/shelly/config")
      .send({ deviceId: "TOMS001-SHELLY-01", ip: "192.168.1.50", name: "照明", location: "1F" });
    assert.equal(put.status, 200);
    const tel = await request(app).get("/api/demo-kit/shelly/telemetry/TOMS001-SHELLY-01");
    assert.equal(tel.status, 200);
    assert.ok(typeof tel.body.powerW === "number");
  });

  it("GET floor-preview-live returns live pins", async () => {
    const res = await request(app).get("/api/demo-kit/floor-preview-live/TOMS001");
    assert.equal(res.status, 200);
    assert.equal(res.body.live, true);
    assert.ok(res.body.layers[0].pins[0].statusColor);
  });

  it("POST demo-packages/house/launch", async () => {
    const res = await request(app).post("/api/demo-kit/demo-packages/house/launch");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.package.type, "house");
  });

  it("POST roi-simulator returns annual reduction", async () => {
    const res = await request(app)
      .post("/api/demo-kit/roi-simulator")
      .send({ siteCount: 2, dispatchCountPerYear: 24, laborCostPerDispatch: 15000, vehicleCostPerDispatch: 5000 });
    assert.equal(res.status, 200);
    assert.ok(res.body.annualReductionJpy > 0);
    assert.equal(res.body.chart.length, 3);
  });

  it("demo-movie start and stop", async () => {
    const start = await request(app)
      .post("/api/demo-kit/demo-movie/start")
      .send({ customerCode: "TOMS001", intervalMs: 100 });
    assert.equal(start.status, 200);
    assert.equal(start.body.ok, true);
    const stop = await request(app).post("/api/demo-kit/demo-movie/stop");
    assert.equal(stop.status, 200);
    assert.equal(stop.body.running, false);
  });

  it("GET /devices page", async () => {
    const res = await request(app).get("/devices");
    assert.equal(res.status, 200);
    assert.match(res.text, /デバイス一覧/);
  });
});
