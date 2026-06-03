import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-survey-pro-map-501";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-pro-map-501.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
import { PRO_FLOOR_TIERS } from "../src/pro-remote/floor-map-stack.js";

const app = createApp();
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Phase 501-520 survey to PRO floor map", () => {
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
      .send({ customerCode: "TOMS001", siteName: "Floor Map Gen" });
    projectId = create.body.projectId;
    await request(app)
      .post(`/api/survey/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ photoType: "aerial", imageBase64: TINY_PNG, fileName: "a.jpg" });
    await request(app)
      .post(`/api/survey/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ photoType: "inside", imageBase64: TINY_PNG, fileName: "i.jpg" });
  });

  after(() => closeDatabase());

  it("generates perimeter 1f 2f only — no roof", async () => {
    const res = await request(app)
      .post(`/api/survey/projects/${projectId}/generate-floor-map`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 201);
    assert.equal(res.body.roofCreated, false);
    assert.deepEqual(res.body.tiers, [...PRO_FLOOR_TIERS]);
    assert.equal(res.body.layers.length, 3);
    const tiers = res.body.layers.map((l: { tier: string }) => l.tier);
    assert.ok(tiers.includes("perimeter"));
    assert.ok(tiers.includes("1f"));
    assert.ok(tiers.includes("2f"));
    assert.ok(!tiers.includes("roof"));
    assert.ok(!tiers.includes("3f"));
    assert.ok(!tiers.some((t: string) => /屋上|RF/i.test(t)));
  });

  it("creates maintenance case from survey", async () => {
    const maintLogin = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.maintenance", password: "demo-remote-2026" });
    const res = await request(app)
      .post(`/api/maintenance/from-survey/${projectId}`)
      .set("Authorization", `Bearer ${maintLogin.body.token}`);
    assert.equal(res.status, 201);
    assert.ok(res.body.caseId?.startsWith("MNT-"));
    assert.ok(res.body.devicePlaceholders?.length >= 1);
  });
});
