import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-survey-sync-501";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-sync-501.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Phase 501-520 survey offline sync API", () => {
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
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
    token = login.body.token;
    const create = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerCode: "TOMS001", siteName: "Sync Test" });
    projectId = create.body.projectId;
  });

  after(() => closeDatabase());

  it("accepts batched sync payload", async () => {
    const res = await request(app)
      .post("/api/survey/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        items: [
          { type: "photo", photoType: "aerial", imageBase64: TINY_PNG, fileName: "a.jpg" },
          { type: "memo", notes: "オフラインから同期" },
          { type: "gps", gpsLat: 35.1, gpsLng: 139.1 },
        ],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, 3);
    const photos = await request(app)
      .get(`/api/survey/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(photos.body.photos.some((p: { photoType: string }) => p.photoType === "aerial"));
  });
});
