/**
 * TESTER001 は実機 RP2350 / SwitchBot へ物理 DO を送らない
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = "test-jwt-tester-hw-mock-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TESTER001_PASSWORD = "tisly-test-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tester-hw-mock-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import(
  "../src/security/rate-limit.js"
);
const {
  getRemoteTestStatus,
  resetRemoteTestState,
  consumePendingCommand,
} = await import("../src/remote-test/remote-test-state.js");
const {
  runWithTesterHardwareMockContextV1,
  shouldBlockPhysicalDoV1,
} = await import("../src/shared/customer/tester-hardware-mock-v1.js");
const { queueChPulseCommand } = await import(
  "../src/remote-test/remote-test-state.js"
);
const { TESTER_CUSTOMER_CODE_V1 } = await import(
  "../src/shared/customer/tester-tenant-v1.js"
);
const { listCustomers } = await import("../src/customer/customer-store.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const app = createApp();

describe("TESTER001 hardware mock — no physical DO", () => {
  before(() => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    resetRateLimitsForTests();
    getDatabase();
    resetRemoteTestState();
  });

  after(() => closeDatabase());

  it("keeps Toyoshima / Itabashi customer rows", () => {
    const codes = listCustomers(true).map((c) => c.customer_code);
    assert.ok(codes.includes("TOMS001"));
    assert.ok(codes.includes("TOYOSHIMA001"));
    assert.ok(codes.includes("TESTER001"));
  });

  it("blocks pulse queue inside tester ALS without touching pendingCommand", () => {
    consumePendingCommand();
    const before = getRemoteTestStatus().pendingCommand;
    const pulsed = runWithTesterHardwareMockContextV1("TESTER001", () =>
      queueChPulseCommand(1, 500)
    );
    assert.equal(pulsed.mocked, true);
    assert.equal(pulsed.transport, "tester_demo_mock");
    assert.equal(getRemoteTestStatus().pendingCommand, before);
    assert.equal(shouldBlockPhysicalDoV1(), false);
  });

  it("TESTER001 relay pulse returns 200 and does not queue firmware DO", async () => {
    consumePendingCommand();
    const login = await request(app).post("/api/auth/customer/login").send({
      customerCode: TESTER_CUSTOMER_CODE_V1,
      username: "tester.user",
      password: "tisly-test-2026",
    });
    assert.equal(login.status, 200, login.body?.error);
    const token = login.body.token as string;

    const pulse = await request(app)
      .post("/api/devices/rp2350/relay/1/pulse")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tisly-Customer-Code", "TESTER001")
      .send({ durationMs: 500, reason: "tester-demo" });
    assert.equal(pulse.status, 200, JSON.stringify(pulse.body));
    assert.equal(pulse.body.ok, true);
    assert.equal(pulse.body.mocked, true);
    assert.equal(pulse.body.transport, "tester_demo_mock");
    assert.equal(getRemoteTestStatus().pendingCommand, null);
  });

  it("TESTER001 security light control is mocked and keeps UI 200", async () => {
    consumePendingCommand();
    const login = await request(app).post("/api/auth/customer/login").send({
      customerCode: TESTER_CUSTOMER_CODE_V1,
      username: "tester.user",
      password: "tisly-test-2026",
    });
    const token = login.body.token as string;
    const res = await request(app)
      .post("/api/home/v1/control")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tisly-Customer-Code", "TESTER001")
      .send({
        siteId: "HOME-JP-ITABASHI-LIVE",
        target: "security_light",
        action: "light_24v_on",
        actor: "tester-demo",
      });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    assert.equal(getRemoteTestStatus().pendingCommand, null);
  });

  it("unauthenticated pulse still queues real firmware command", async () => {
    consumePendingCommand();
    const pulse = await request(app)
      .post("/api/devices/rp2350/relay/2/pulse")
      .send({ durationMs: 400, reason: "live-path" });
    assert.equal(pulse.status, 200, JSON.stringify(pulse.body));
    assert.notEqual(pulse.body.transport, "tester_demo_mock");
    assert.equal(getRemoteTestStatus().pendingCommand, "ch2_pulse_400");
    consumePendingCommand();
  });

  it("customer-auth and home control send tester session headers", () => {
    const authJs = fs.readFileSync(
      path.join(serverRoot, "public/js/customer-auth.js"),
      "utf8"
    );
    assert.match(authJs, /getTislySessionHeadersV1/);
    assert.match(authJs, /X-Tisly-Customer-Code/);
    const sharedJs = fs.readFileSync(
      path.join(serverRoot, "public/js/features/home/home-shared-v1.js"),
      "utf8"
    );
    assert.match(sharedJs, /getTislySessionHeadersV1/);
    const intercomJs = fs.readFileSync(
      path.join(
        serverRoot,
        "public/js/features/home/home-intercom-link-v1.js"
      ),
      "utf8"
    );
    assert.match(intercomJs, /getTislySessionHeadersV1/);
    const lightJs = fs.readFileSync(
      path.join(
        serverRoot,
        "public/js/features/security/security-floor-manual-light-v1.js"
      ),
      "utf8"
    );
    assert.match(lightJs, /getTislySessionHeadersV1/);
  });
});
