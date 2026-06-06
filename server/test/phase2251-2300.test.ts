import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildPhase2300ProductionCheck } from "../src/deploy/phase2300-production-check.js";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../src/pwa/pwa-shell-version.js";
import { getEmailProviderMode, resetEmailNotificationProvider } from "../src/notification/email-provider.js";
import { getQnapConnector, resetQnapConnector } from "../src/qnap/qnap-connector.js";

process.env.JWT_SECRET = "test-phase2251-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2251-2300.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.NOTIFICATION_EMAIL_MODE = "mock";
process.env.QNAP_MODE = "mock";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(repoRoot, "server/public");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";

describe("Phase 2251-2300 production readiness", () => {
  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    adminToken = login.body.token;
  });

  after(() => {
    resetEmailNotificationProvider();
    resetQnapConnector();
    closeDatabase();
  });

  describe("buildPhase2300ProductionCheck", () => {
    it("reports production readiness", () => {
      const report = buildPhase2300ProductionCheck();
      assert.equal(report.phase, "2251-2300");
      assert.equal(report.shellVersion, PWA_SHELL_VERSION);
      assert.equal(report.shellTag, PWA_SHELL_TAG);
      assert.ok(report.implemented.length >= 6);
      assert.ok(report.mockRemaining.length >= 3);
      assert.ok(report.productionRatePercent >= 85);
      assert.ok(report.checks.every((c) => c.ok));
      assert.ok(report.ready);
      assert.ok(report.operationalReady);
    });
  });

  describe("GET /api/deploy/production-check-2300", () => {
    it("returns phase 2300 legacy report JSON", async () => {
      const res = await request(app).get("/api/deploy/production-check-2300");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2251-2300");
      assert.ok(res.body.operationalReady);
    });
  });

  describe("MQTT status API", () => {
    it("GET pro-remote mqtt-status includes topicCount", async () => {
      const login = await request(app)
        .post("/api/auth/customer/login")
        .send({
          customerCode: "TOMS001",
          username: "toms001.maintenance",
          password: "demo-remote-2026",
        });
      const token = login.body.token;
      const res = await request(app)
        .get("/api/customer/TOMS001/pro-remote/mqtt-status")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok("topicCount" in res.body);
      assert.ok("messageCount" in res.body);
    });
  });

  describe("Shelly recovery API", () => {
    it("POST /api/recovery/shelly/reboot records history", async () => {
      const db = getDatabase();
      const existing = db
        .prepare(`SELECT device_id FROM devices WHERE device_type LIKE '%shelly%' LIMIT 1`)
        .get() as { device_id: string } | undefined;
      if (!existing) {
        db.prepare(
          `INSERT INTO devices (device_id, customer_id, device_type, label, device_status, created_at, updated_at)
           SELECT 'TEST-SHELLY-001', customer_id, 'shelly-plus-1', 'Test Shelly', 'ONLINE', datetime('now'), datetime('now')
           FROM customers WHERE customer_code = 'TOMS001' LIMIT 1`
        ).run();
      }
      const deviceId =
        existing?.device_id ??
        (db.prepare(`SELECT device_id FROM devices WHERE device_id = 'TEST-SHELLY-001'`).get() as {
          device_id: string;
        }).device_id;

      const reboot = await request(app)
        .post("/api/recovery/shelly/reboot")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ deviceId, customerCode: "TOMS001", dryRun: true });
      assert.equal(reboot.status, 200);
      assert.ok(reboot.body.ok);
      assert.ok(reboot.body.actionId);

      const hist = await request(app)
        .get("/api/recovery/shelly/history?customerCode=TOMS001&limit=10")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(hist.status, 200);
      assert.ok(hist.body.entries.some((e: { deviceId: string }) => e.deviceId === deviceId));
    });
  });

  describe("Notification stats", () => {
    it("GET /api/notifications/stats returns email mode", async () => {
      assert.equal(getEmailProviderMode(), "mock");
      const res = await request(app).get("/api/notifications/stats");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2301-2350");
      assert.ok("successRatePercent" in res.body);
      assert.equal(res.body.emailMode, "mock");
      assert.ok("gmailMode" in res.body);
      assert.ok("smtpConfigured" in res.body);
    });
  });

  describe("QNAP connector", () => {
    it("POST /api/qnap/send/event logs send", async () => {
      const connector = getQnapConnector();
      assert.equal(connector.mode, "mock");
      const res = await request(app)
        .post("/api/qnap/send/event")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ customerCode: "TOMS001", payload: { deviceId: "ESP-001", eventType: "test" } });
      assert.equal(res.status, 201);
      assert.ok(res.body.ok);
      assert.ok(res.body.logId);

      const logs = await request(app)
        .get("/api/qnap/send-logs?limit=5")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(logs.status, 200);
      assert.ok(logs.body.logs.length >= 1);
      assert.ok(logs.body.stats);
    });
  });

  describe("UI assets", () => {
    it("customer portal has elderly-friendly CSS vars", () => {
      const css = fs.readFileSync(path.join(publicDir, "css/customer-portal.css"), "utf8");
      assert.ok(css.includes("--portal-tap-min"));
      assert.ok(css.includes("min-height: 120px"));
    });

    it("tv dashboard has 10ft CSS vars", () => {
      const css = fs.readFileSync(path.join(publicDir, "css/tv-dashboard.css"), "utf8");
      assert.ok(css.includes("--tv-font-hero"));
      assert.ok(css.includes("clamp("));
    });

    it("pro-remote mqtt panel shows topic count", () => {
      const js = fs.readFileSync(path.join(publicDir, "js/pro-remote-mqtt-panel.js"), "utf8");
      const html = fs.readFileSync(path.join(publicDir, "pro-remote.html"), "utf8");
      assert.ok(js.includes("topicCount"));
      assert.ok(html.includes("pro-mqtt-topics"));
    });
  });
});
