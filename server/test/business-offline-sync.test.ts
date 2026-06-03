import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-offline-sync";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-offline-sync.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 561-580 business offline sync", () => {
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

  it("POST offline/sync processes project_create", async () => {
    const res = await request(app)
      .post("/api/business/offline/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          {
            type: "project_create",
            payload: {
              customerId: "BCU-SEED-TOMS",
              customerName: "オフライン様",
              title: "オフライン同期案件",
            },
          },
        ],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.synced.length, 1);
    assert.equal(res.body.failed.length, 0);
  });
});
