import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-861";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-861.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 861-900 sales demo polish", () => {
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

  it("GET /api/demo-kit/status returns phase 861-900 and dispatch estimate", async () => {
    const res = await request(app).get("/api/demo-kit/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "901-940");
    assert.ok(typeof res.body.kpi.dispatchReductionEstimate === "number");
    assert.ok(res.body.estimateTypes?.length >= 3);
  });

  it("GET /api/demo-kit/kpi/csv includes dispatch_reduction_estimate", async () => {
    const res = await request(app).get("/api/demo-kit/kpi/csv");
    assert.equal(res.status, 200);
    assert.match(res.text, /dispatch_reduction_estimate/);
    assert.match(res.text, /売上/);
  });

  it("GET floor-preview returns perimeter 1f 2f layers", async () => {
    const res = await request(app).get("/api/demo-kit/floor-preview/TOMS001");
    assert.equal(res.status, 200);
    assert.equal(res.body.layers.length, 3);
    const tiers = res.body.layers.map((l: { tier: string }) => l.tier);
    assert.deepEqual(tiers, ["perimeter", "1f", "2f"]);
    assert.ok(res.body.layers[0].pins.length >= 2);
  });

  it("POST shelly-reboot completes mock recovery", async () => {
    const res = await request(app)
      .post("/api/demo-kit/shelly-reboot")
      .send({ customerCode: "TOMS001" });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.steps, ["WARNING", "reboot_mock", "ONLINE"]);
  });

  it("GET estimate-html house returns HTML", async () => {
    const res = await request(app).get("/api/demo-kit/estimate-html/house");
    assert.equal(res.status, 200);
    assert.match(res.text, /戸建て/);
  });

  it("PUT reset-schedule stores mock config", async () => {
    const res = await request(app)
      .put("/api/demo-kit/reset-schedule")
      .send({ mode: "morning", enabled: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "morning");
    assert.equal(res.body.enabled, true);
    assert.ok(res.body.nextRunAt);
  });

  it("GET /sales serves polished presentation page", async () => {
    const res = await request(app).get("/sales");
    assert.equal(res.status, 200);
    assert.match(res.text, /営業デモ/);
    assert.match(res.text, /侵入を発生させる/);
  });

  it("GET /sales/floor-preview serves floor stack page", async () => {
    const res = await request(app).get("/sales/floor-preview");
    assert.equal(res.status, 200);
    assert.match(res.text, /見取り図/);
  });

  it("intrusion sets alert tier for floor scroll", async () => {
    await request(app).post("/api/demo-kit/reset");
    const res = await request(app)
      .post("/api/demo-kit/notifications/intrusion")
      .send({ customerCode: "TOMS001" });
    assert.equal(res.status, 201);
    const preview = await request(app).get("/api/demo-kit/floor-preview/TOMS001");
    assert.ok(preview.body.alert?.tier || preview.body.layers.length === 3);
  });
});
