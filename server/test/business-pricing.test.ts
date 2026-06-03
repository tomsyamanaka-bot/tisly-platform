import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-pricing";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-pricing.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 541-560 business pricing CRUD", () => {
  let token = "";
  let ruleId = "";

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

  it("CRUD pricing rules", async () => {
    const list = await request(app)
      .get("/api/business/pricing")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.rules));

    const created = await request(app)
      .post("/api/business/pricing")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scopeType: "customer",
        scopeRef: "BCU-SEED-TOMS",
        name: "テスト単価",
        unitPrice: 9999,
        workCategory: "camera",
      });
    assert.equal(created.status, 201);
    ruleId = created.body.rule.id;

    const patched = await request(app)
      .patch(`/api/business/pricing/${ruleId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ unitPrice: 12000, active: false });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.rule.unitPrice, 12000);
    assert.equal(patched.body.rule.active, false);

    const del = await request(app)
      .delete(`/api/business/pricing/${ruleId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 204);
  });
});
