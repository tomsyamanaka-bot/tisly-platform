import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-qnap";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-qnap.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { generateQnapBusinessRoot } = await import("../src/business/services/qnapService.js");

const app = createApp();

describe("Phase 541-560 business QNAP API", () => {
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
        title: "QNAP試験",
      });
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("generates QNAP business path", async () => {
    const proj = (
      await request(app)
        .get(`/api/business/projects/${projectId}`)
        .set("Authorization", `Bearer ${token}`)
    ).body.project;
    const root = generateQnapBusinessRoot(proj);
    assert.match(root, /^\/TOMS\/案件\/\d{4}\/PRJ-/);
  });

  it("POST qnap/save mock persists files", async () => {
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/qnap/save`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.saveResult.status, "synced");
    assert.ok(res.body.saveResult.savedFiles.length >= 1);
  });
});
