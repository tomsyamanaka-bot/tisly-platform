import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-google-tv-sales-rc.db";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Google TV sales RC", () => {
  after(() => closeDatabase());

  it("GET /tv/TOMS001 includes remote hint", async () => {
    const res = await request(app).get("/tv/TOMS001");
    assert.equal(res.status, 200);
    assert.match(res.text, /tv-detail-overlay/i);
    assert.match(res.text, /tv-view-label/i);
  });

  it("POST /api/demo-kit/tv/push", async () => {
    const res = await request(app)
      .post("/api/demo-kit/tv/push")
      .send({ customerCode: "TOMS001", title: "RC", message: "test" });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.tvUrl, "/tv/TOMS001");
  });
});
