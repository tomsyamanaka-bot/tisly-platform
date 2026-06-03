import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-svy";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-svy.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { createSurveyProject } = await import("../src/survey/survey-store.js");

const app = createApp();

describe("Phase 541-560 Survey to Business", () => {
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

  it("POST from-survey creates business project with linkage", async () => {
    const survey = createSurveyProject({
      customerCode: "TOMS001",
      siteName: "Survey現場A",
      address: "東京都",
      gpsLat: 35.68,
      gpsLng: 139.76,
    });
    const res = await request(app)
      .post(`/api/business/from-survey/${survey.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.equal(res.body.project.surveyProjectId, survey.projectId);
    assert.ok(res.body.project.customerName.includes("Survey") || res.body.project.title);
    const again = await request(app)
      .post(`/api/business/from-survey/${survey.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(again.status, 201);
    assert.equal(again.body.project.id, res.body.project.id);
  });
});
