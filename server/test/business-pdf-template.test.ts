import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-pdf-tpl";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-pdf-tpl.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 561-580 TOMS PDF templates", () => {
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
        title: "PDF試験",
      });
    projectId = create.body.project.id;
    await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ name: "カメラ設置", quantity: 1, unitPrice: 50000, unit: "式" }] });
  });

  after(() => closeDatabase());

  it("GET estimate pdf/html", async () => {
    const html = await request(app)
      .get(`/api/business/projects/${projectId}/pdf/estimate`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(html.status, 200);
    assert.match(html.text, /お見積書/);
    assert.match(html.text, /税込合計/);
    assert.match(html.text, /株式会社TOMS/);
    assert.match(html.text, /項目/);
  });
});
