import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-drawing-ocr-501";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-drawing-ocr-501.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Phase 501-520 drawing OCR placeholder", () => {
  let token = "";
  let drawingId = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
    token = login.body.token;
    const proj = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerCode: "TOMS001", siteName: "OCR Test" });
    const draw = await request(app)
      .post("/api/survey/drawing")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId: proj.body.projectId, imageBase64: TINY_PNG, fileName: "sketch.png" });
    drawingId = draw.body.id;
  });

  after(() => closeDatabase());

  it("returns OCR placeholder floors and rooms", async () => {
    const res = await request(app)
      .post(`/api/survey/drawing/${drawingId}/ocr`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.floors, ["外周", "1F", "2F"]);
    assert.ok(res.body.rooms.includes("玄関"));
    assert.ok(res.body.symbols.includes("camera"));
    assert.equal(res.body.placeholder, true);
  });
});
