import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-map-421";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-device-map-421.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { recordDeviceHeartbeat } = await import("../src/device/device-heartbeat.js");

const app = createApp();

describe("Phase 421-440 map live status", () => {
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

  it("map live returns deviceStatus for demo devices", async () => {
    recordDeviceHeartbeat("DEMO-ESP-LIVING", "test");
    const res = await request(app)
      .get("/api/customer/DEMO001/map/live")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.devices));
    const living = res.body.devices.find((d: { deviceId: string }) => d.deviceId === "DEMO-ESP-LIVING");
    assert.ok(living);
    assert.equal(living.deviceStatus, "ONLINE");
  });
});
