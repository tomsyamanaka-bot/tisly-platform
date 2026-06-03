import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-qnap-up";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-qnap-up.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_UPLOAD_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 561-580 QNAP upload API", () => {
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
        title: "QNAP upload試験",
      });
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("POST upload and GET status", async () => {
    const up = await request(app)
      .post(`/api/business/projects/${projectId}/qnap/upload`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(up.status, 200);
    assert.equal(up.body.upload.mode, "mock");

    const st = await request(app)
      .get(`/api/business/projects/${projectId}/qnap/status`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(st.status, 200);
    assert.equal(st.body.mode, "mock");
    const mirror = path.join(process.cwd(), "uploads", "qnap-mock", projectId);
    assert.ok(fs.existsSync(mirror));
  });
});
