import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-survey-phase481";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-production-phase481.db";
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

describe("Phase 481-500 survey production", () => {
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
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("CRUD survey projects", async () => {
    const create = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerCode: "TOMS001", siteName: "テスト現場", address: "東京都" });
    assert.equal(create.status, 201);
    projectId = create.body.projectId;
    const list = await request(app)
      .get("/api/survey/projects?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.projects.some((p: { projectId: string }) => p.projectId === projectId));
    const patch = await request(app)
      .patch(`/api/survey/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ gpsLat: 35.68, gpsLng: 139.76, status: "active" });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.gpsLat, 35.68);
  });

  it("uploads survey photo and drawing", async () => {
    const photo = await request(app)
      .post(`/api/survey/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ photoType: "outside", imageBase64: TINY_PNG, fileName: "out.jpg" });
    assert.equal(photo.status, 201);
    const photos = await request(app)
      .get(`/api/survey/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(photos.status, 200);
    assert.equal(photos.body.photos.length, 1);
    const drawing = await request(app)
      .post("/api/survey/drawing")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId, imageBase64: TINY_PNG, fileName: "sketch.png", mimeType: "image/png" });
    assert.equal(drawing.status, 201);
    const drawings = await request(app)
      .get(`/api/survey/drawing?projectId=${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(drawings.status, 200);
    assert.equal(drawings.body.drawings.length, 1);
  });

  it("checklist and AI estimate placeholder", async () => {
    const put = await request(app)
      .put(`/api/survey/projects/${projectId}/checklist`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checklist: { line: { checked: true, note: "OK" } } });
    assert.equal(put.status, 200);
    const ai = await request(app)
      .post(`/api/survey/projects/${projectId}/ai-estimate`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(ai.status, 201);
    assert.ok(ai.body.recommended.espCount >= 1);
  });
});
