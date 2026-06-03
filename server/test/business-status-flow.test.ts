import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-status";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-status.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { canTransitionStatus } = await import("../src/business/business-status.js");

const app = createApp();

describe("Phase 541-560 business status flow", () => {
  let token = "";
  let projectId = "";

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
    const create = await request(app)
      .post("/api/business/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: "BCU-SEED-TOMS",
        customerName: "山田様",
        title: "ステータス試験",
      });
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("allows canonical status transitions", () => {
    assert.ok(canTransitionStatus("new", "survey_scheduled"));
    assert.ok(canTransitionStatus("estimate_sent", "construction_scheduled"));
    assert.ok(!canTransitionStatus("new", "paid"));
  });

  it("POST status triggers side effects", async () => {
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "survey_scheduled" });
    assert.equal(res.status, 200);
    assert.equal(res.body.project.status, "survey_scheduled");
    assert.ok(res.body.calendarDraft);
  });
});
