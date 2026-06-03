import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-pay-acct";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-pay-acct.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 561-580 payments and accounting CSV", () => {
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
        title: "入金試験",
      });
    projectId = create.body.project.id;
    await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ name: "作業", quantity: 1, unitPrice: 10000, unit: "式" }] });
    await request(app)
      .post(`/api/business/projects/${projectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentDueDate: "2026-07-01" });
  });

  after(() => closeDatabase());

  it("records payment and exports accounting csv", async () => {
    const pay = await request(app)
      .post(`/api/business/projects/${projectId}/payment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 11000, paymentDate: "2026-06-15", method: "bank_transfer" });
    assert.equal(pay.status, 201);

    const list = await request(app)
      .get("/api/business/payments")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.payments.length >= 1);

    const csv = await request(app)
      .get("/api/business/accounting/export-csv")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(csv.status, 200);
    assert.match(csv.text, /顧客名/);
    assert.match(csv.text, /入金試験/);
  });
});
