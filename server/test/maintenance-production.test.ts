import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-maint-phase481";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-maintenance-production-phase481.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function maintenanceLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.maintenance", password: "demo-remote-2026" });
}

describe("Phase 481-500 maintenance production", () => {
  let token = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await maintenanceLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("creates maintenance case with site binding", async () => {
    const created = await request(app)
      .post("/api/maintenance/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        siteName: "デモ現場",
        deviceIds: ["ESP-001"],
        notes: "定期点検",
      });
    assert.equal(created.status, 201);
    assert.ok(created.body.caseId.startsWith("MNT-"));
    const list = await request(app)
      .get("/api/maintenance/cases?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.cases.length >= 1);
  });

  it("lists recovery history for customer", async () => {
    const res = await request(app)
      .get("/api/maintenance/recovery-history/TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
  });

  it("lists shelly devices API", async () => {
    const res = await request(app)
      .get("/api/maintenance/shelly/TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.devices));
  });
});
