import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-survey-report-501";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-report-501.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 501-520 survey report HTML", () => {
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
    const create = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ customerCode: "TOMS001", siteName: "Report Site", address: "東京都" });
    projectId = create.body.projectId;
  });

  after(() => closeDatabase());

  it("serves HTML report at /survey/:id/report", async () => {
    const res = await request(app).get(`/survey/${projectId}/report`);
    assert.equal(res.status, 200);
    assert.match(res.text, /現調レポート/);
    assert.match(res.text, /Report Site/);
    assert.match(res.text, /TOMS001/);
  });

  it("serves authenticated API report html", async () => {
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
    const res = await request(app)
      .get(`/api/survey/projects/${projectId}/report.html`)
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /<html/);
  });
});
