import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-ai-intake-501";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-ai-survey-intake-501.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Phase 501-520 AI survey intake", () => {
  let token = "";
  let projectId = "";

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
    const login = await surveyorLogin();
    token = login.body.token;
    const create = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerCode: "TOMS001", siteName: "AI Intake Test" });
    projectId = create.body.projectId;
    await request(app)
      .post(`/api/survey/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ photoType: "outside", imageBase64: TINY_PNG, fileName: "o.jpg" });
  });

  after(() => closeDatabase());

  it("returns mock AI intake structure", async () => {
    const res = await request(app)
      .post(`/api/survey/projects/${projectId}/ai/intake`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "テストメモ" });
    assert.equal(res.status, 201);
    assert.equal(res.body.placeholder, true);
    assert.ok(Array.isArray(res.body.rooms));
    assert.ok(Array.isArray(res.body.recommended_devices));
    assert.ok(res.body.exterior_points.length >= 1);
  });
});
