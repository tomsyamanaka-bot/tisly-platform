import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-svy-btn";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-svy-btn.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { createSurveyProject } = await import("../src/survey/survey-store.js");

const app = createApp();

describe("Phase 561-580 Survey TOMS button API", () => {
  let token = "";

  before(async () => {
    closeDatabase();
    for (const p of [
      process.env.TISLY_DB_PATH!,
      `${process.env.TISLY_DB_PATH}-wal`,
      `${process.env.TISLY_DB_PATH}-shm`,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("from-survey returns project for PWA navigation", async () => {
    const survey = createSurveyProject({
      customerCode: "TOMS001",
      siteName: "ボタン試験現場",
      address: "大阪府",
    });
    const res = await request(app)
      .post(`/api/business/from-survey/${survey.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.ok(res.body.project?.id);
    assert.equal(res.body.project.surveyProjectId, survey.projectId);
    assert.ok(res.body.nextAction);
  });
});
