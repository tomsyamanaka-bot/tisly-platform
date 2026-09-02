import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";

process.env.JWT_SECRET = "test-jwt-attendance-punch-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-attendance-punch-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ATTENDANCE_PUNCH_DATA_DIR = "./data/test-attendance-punch-v1";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { resetAttendancePunchLogsForTestV1 } = await import(
  "../src/attendance/attendance-punch-v1.js"
);

const app = createApp();

async function login(username = "toms001.surveyor") {
  const res = await request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username,
      password: "demo-remote-2026",
    });
  assert.equal(res.status, 200);
  return res.body.token as string;
}

describe("attendance-punch-v1", () => {
  before(() => {
    resetAttendancePunchLogsForTestV1();
  });

  after(() => {
    resetAttendancePunchLogsForTestV1();
    const dir = path.join(process.cwd(), "data", "test-attendance-punch-v1");
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    closeDatabase();
  });

  it("POST /api/attendance/v1/punch records clock_in with relay unlock", async () => {
    const token = await login();
    const res = await request(app)
      .post("/api/attendance/v1/punch")
      .set("Authorization", `Bearer ${token}`)
      .send({ punchType: "clock_in", employeeName: "山田 太郎" });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.log.punchType, "clock_in");
    assert.equal(res.body.log.employeeName, "山田 太郎");
    assert.equal(res.body.log.relayUnlock.channel, "CH1");
    assert.equal(res.body.log.relayUnlock.status, "success");
    assert.ok(Array.isArray(res.body.logs));
    assert.ok(res.body.logs.length >= 1);
  });

  it("GET /api/attendance/v1/logs returns tenant-scoped punch list", async () => {
    const token = await login();
    const punch = await request(app)
      .post("/api/attendance/v1/punch")
      .set("Authorization", `Bearer ${token}`)
      .send({ punchType: "clock_out" });
    assert.equal(punch.status, 200);

    const res = await request(app)
      .get("/api/attendance/v1/logs")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.logs.some((row: { punchType: string }) => row.punchType === "clock_out"));
  });

  it("rejects invalid punchType", async () => {
    const token = await login();
    const res = await request(app)
      .post("/api/attendance/v1/punch")
      .set("Authorization", `Bearer ${token}`)
      .send({ punchType: "break" });
    assert.equal(res.status, 400);
  });
});
