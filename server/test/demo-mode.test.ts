import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-demo-421";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-demo-mode-421.db";
process.env.DEMO_MODE = "true";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { config } = await import("../src/config.js");
const { emitSimulatorEvent } = await import("../src/demo/demo-mode-esp.js");

const app = createApp();

describe("Phase 421-440 demo mode", () => {
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
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "DEMO001",
        username: "demo001.viewer",
        password: "demo-remote-2026",
      });
    assert.equal(login.status, 200);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("config.demoMode true with DEMO_MODE env", () => {
    assert.equal(config.demoMode, true);
  });

  it("DEMO001 customer exists after migration", async () => {
    const res = await request(app)
      .get("/api/customer/DEMO001/health")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.devices.total >= 3);
  });

  it("simulator emits events", () => {
    const r = emitSimulatorEvent("DEMO001", "intrusion");
    assert.equal(r.ok, true);
    assert.ok(r.deviceId);
  });
});
