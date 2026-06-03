import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-cal";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-cal.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 541-560 business calendar API", () => {
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
        title: "カレンダー試験",
      });
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("POST calendar/site-survey creates CalendarDraft", async () => {
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/calendar/site-survey`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-06-15", startTime: "10:00", endTime: "12:00" });
    assert.equal(res.status, 200);
    assert.equal(res.body.calendarDraft.type, "survey");
    assert.ok(res.body.calendarDraft.start.includes("2026-06-15"));
  });

  it("POST calendar/construction and payment", async () => {
    for (const st of ["survey_done", "estimate_created", "estimate_sent"] as const) {
      await request(app)
        .post(`/api/business/projects/${projectId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: st });
    }
    const c = await request(app)
      .post(`/api/business/projects/${projectId}/calendar/construction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-06-20" });
    assert.equal(c.status, 200);
    assert.equal(c.body.calendarDraft.type, "construction");
    const p = await request(app)
      .post(`/api/business/projects/${projectId}/calendar/payment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-07-01" });
    assert.equal(p.status, 200);
    assert.equal(p.body.calendarDraft.type, "payment");
  });
});
