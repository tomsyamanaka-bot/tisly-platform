import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

process.env.SHELLY_MODE = "mock";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-sales-checklist.db";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Sales demo checklist", () => {
  after(() => closeDatabase());

  it("GET /api/demo-kit/sales/checklist", async () => {
    const res = await request(app).get("/api/demo-kit/sales/checklist");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "981-1000");
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.length >= 7);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    assert.ok(ids.includes("websocket"));
    assert.ok(ids.includes("google_tv"));
    assert.ok(ids.includes("shelly"));
    assert.ok(ids.includes("esp_topic"));
    assert.ok(ids.includes("pdf"));
    assert.ok(ids.includes("pwa"));
    assert.ok(ids.includes("demo_reset"));
  });

  it("GET /sales/checklist page", async () => {
    const res = await request(app).get("/sales/checklist");
    assert.equal(res.status, 200);
    assert.match(res.text, /営業デモ完成チェック/);
  });

  it("GET /api/demo-kit/sales-pdf/archive", async () => {
    const res = await request(app).get("/api/demo-kit/sales-pdf/archive");
    assert.equal(res.status, 200);
    assert.ok(res.body.entries?.length >= 3);
  });
});
