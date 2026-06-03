import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-mail";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-mail.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { DEFAULT_MAIL_TO } = await import("../src/business/business-types.js");

const app = createApp();

describe("Phase 541-560 business mail API", () => {
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
        title: "メール試験",
      });
    projectId = create.body.project.id;
    await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ name: "テスト", category: "other", quantity: 1, unitPrice: 10000, unit: "式" }],
      });
  });

  after(() => closeDatabase());

  it("POST mail/estimate-ready creates MailDraft", async () => {
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/mail/estimate-ready`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.mail.to, DEFAULT_MAIL_TO);
    assert.equal(res.body.mail.type, "estimate_ready");
    assert.ok(res.body.mail.attachmentPaths.length >= 1);
  });
});
