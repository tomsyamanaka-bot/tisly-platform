import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-demo-reset-cron.db";
process.env.DEMO_RESET_ENABLED = "false";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { getDemoResetSchedule } = await import("../src/demo-kit/demo-reset-schedule.js");
const { stopDemoResetCron } = await import("../src/demo-kit/demo-reset-cron.js");
const cron = await import("node-cron");

const app = createApp();

describe("Demo reset cron schedule", () => {
  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
  });

  after(() => {
    stopDemoResetCron();
    closeDatabase();
  });

  it("GET reset-schedule includes cronExpr and envEnabled", async () => {
    const res = await request(app).get("/api/demo-kit/reset-schedule");
    assert.equal(res.status, 200);
    assert.ok("cronExpr" in res.body);
    assert.ok("envEnabled" in res.body);
  });

  it("PUT reset-schedule morning mode", async () => {
    const res = await request(app)
      .put("/api/demo-kit/reset-schedule")
      .send({ mode: "morning", enabled: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "morning");
    assert.equal(res.body.enabled, true);
  });

  it("validates default cron expression", () => {
    const sched = getDemoResetSchedule();
    assert.ok(cron.validate(sched.cronExpr) || sched.cronExpr === "—");
  });

  it("POST manual reset still works", async () => {
    const res = await request(app).post("/api/demo-kit/reset");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});
