import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-821";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-821.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { DEMO_PACK_CODES } = await import("../src/demo-kit/demo-customer-pack.js");
const { buildTomsKpi } = await import("../src/toms/toms-kpi.js");

const app = createApp();

describe("Phase 821-860 demo kit and sales ready mode", () => {
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

  it("seeds five demo customers on startup", () => {
    for (const code of DEMO_PACK_CODES) {
      const row = getDatabase()
        .prepare(`SELECT customer_code FROM customers WHERE customer_code = ?`)
        .get(code) as { customer_code: string } | undefined;
      assert.equal(row?.customer_code, code);
    }
  });

  it("GET /api/demo-kit/status returns pack and KPI", async () => {
    const res = await request(app).get("/api/demo-kit/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "821-860");
    assert.equal(res.body.customers.length, 5);
    assert.ok(res.body.kpi);
  });

  it("POST /api/demo-kit/reset regenerates demo data", async () => {
    const res = await request(app).post("/api/demo-kit/reset");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.customers.customers, 5);
    assert.ok(res.body.floorMaps.pins >= 30);
  });

  it("demo timeline has 30-day marker events", async () => {
    await request(app).post("/api/demo-kit/reset");
    const count = (
      getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM events WHERE source_type = 'demo-kit'`)
        .get() as { c: number }
    ).c;
    assert.ok(count >= 8);
  });

  it("floor maps have pins for TOMS001 tiers", async () => {
    await request(app).post("/api/demo-kit/reset");
    for (const tier of ["perimeter", "1f", "2f"]) {
      const pins = (
        getDatabase()
          .prepare(`SELECT COUNT(*) as c FROM pro_map_pins WHERE layer_id = ?`)
          .get(`layer-TOMS001-${tier}`) as { c: number }
      ).c;
      assert.ok(pins >= 2, `tier ${tier} pins`);
    }
  });

  it("POST notification intrusion reflects to logs", async () => {
    await request(app).post("/api/demo-kit/reset");
    const res = await request(app)
      .post("/api/demo-kit/notifications/intrusion")
      .send({ customerCode: "TOMS001" });
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, "intrusion");
    const log = getDatabase()
      .prepare(`SELECT id FROM notification_logs WHERE id = ?`)
      .get(res.body.notificationLogId);
    assert.ok(log);
  });

  it("POST ai-estimate mock flow", async () => {
    await request(app).post("/api/demo-kit/reset");
    const res = await request(app)
      .post("/api/demo-kit/ai-estimate")
      .send({ customerCode: "TISLY-DEMO" });
    assert.equal(res.status, 200);
    assert.ok(res.body.aiCandidate);
    assert.equal(res.body.steps.length, 4);
  });

  it("KPI shows revenue after demo seed", async () => {
    await request(app).post("/api/demo-kit/reset");
    const kpi = buildTomsKpi();
    assert.ok(kpi.revenue > 0);
    assert.ok(kpi.monthly.length > 0);
  });

  it("GET /sales serves presentation page", async () => {
    const res = await request(app).get("/sales");
    assert.equal(res.status, 200);
    assert.match(res.text, /営業プレゼンモード/);
  });
});
