import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildPhase2350ProductionCheck } from "../src/deploy/phase2350-production-check.js";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../src/pwa/pwa-shell-version.js";
import {
  getEmailProviderMode,
  resetEmailNotificationProvider,
} from "../src/notification/email-provider.js";
import {
  getGmailSmtpStatus,
  maskSmtpCredentials,
} from "../src/notification/smtp-gmail.js";
import { getLastGmailSendStatus, listGmailSendLogs } from "../src/notification/gmail-send-log.js";

process.env.JWT_SECRET = "test-phase2301-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2301-2350.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.GMAIL_SEND_MODE = "mock";
process.env.NOTIFICATION_EMAIL_MODE = "mock";
process.env.NOTIFICATION_TEST_TO = "test-recipient@example.com";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(repoRoot, "server/public");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";

describe("Phase 2301-2350 Gmail SMTP production", () => {
  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    adminToken = login.body.token;
  });

  after(() => {
    resetEmailNotificationProvider();
    closeDatabase();
  });

  describe("buildPhase2350ProductionCheck", () => {
    it("reports Gmail SMTP readiness", () => {
      const report = buildPhase2350ProductionCheck();
      assert.equal(report.phase, "2301-2350");
      assert.equal(report.shellVersion, PWA_SHELL_VERSION);
      assert.equal(report.shellTag, PWA_SHELL_TAG);
      assert.ok(report.implemented.length >= 5);
      assert.ok(report.checks.every((c) => c.ok));
      assert.ok(report.ready);
      assert.ok(report.operationalReady);
    });
  });

  describe("GET /api/deploy/production-check-2350", () => {
    it("returns phase 2350 legacy report JSON", async () => {
      const res = await request(app).get("/api/deploy/production-check-2350");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2301-2350");
      assert.ok(res.body.operationalReady);
    });
  });

  describe("smtp-gmail helpers", () => {
    it("masks credentials without exposing password", () => {
      process.env.SMTP_USER = "toms.t.yamanaka@gmail.com";
      delete process.env.SMTP_PASS;
      const masked = maskSmtpCredentials();
      assert.ok(masked.includes("SMTP_USER=toms.t.yamanaka@gmail.com"));
      assert.ok(masked.includes("SMTP_PASS=****"));
      assert.ok(!masked.includes("app-password"));
    });

    it("YELLOW when real mode without SMTP_PASS", () => {
      process.env.GMAIL_SEND_MODE = "real";
      process.env.NOTIFICATION_EMAIL_MODE = "gmail";
      delete process.env.SMTP_PASS;
      resetEmailNotificationProvider();
      const status = getGmailSmtpStatus();
      assert.equal(status.gmailMode, "real");
      assert.equal(status.smtpConfigured, false);
      assert.equal(status.statusLabel, "Gmail not configured");
      assert.equal(status.infraStatus, "YELLOW");
      process.env.GMAIL_SEND_MODE = "mock";
      process.env.NOTIFICATION_EMAIL_MODE = "mock";
      resetEmailNotificationProvider();
    });
  });

  describe("GET /api/notifications/stats", () => {
    it("returns gmailMode smtpConfigured lastSendStatus", async () => {
      assert.equal(getEmailProviderMode(), "mock");
      const res = await request(app).get("/api/notifications/stats");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2301-2350");
      assert.equal(res.body.gmailMode, "mock");
      assert.equal(res.body.smtpConfigured, false);
      assert.ok(res.body.lastSendStatus);
      assert.ok(res.body.maskedCredentials.includes("SMTP_PASS=****"));
    });
  });

  describe("POST /api/notifications/test-email", () => {
    it("records mock send log in DB", async () => {
      const res = await request(app)
        .post("/api/notifications/test-email")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.logId);
      assert.equal(res.body.mock, true);

      const logs = listGmailSendLogs(5);
      assert.ok(logs.some((l) => l.id === res.body.logId));
      assert.equal(logs[0].status, "mock");

      const last = getLastGmailSendStatus();
      assert.equal(last.status, "mock");
      assert.equal(last.recipient, "test-recipient@example.com");
    });

    it("rejects without admin auth", async () => {
      const res = await request(app).post("/api/notifications/test-email");
      assert.equal(res.status, 401);
    });

    it("503 when real mode without SMTP_PASS", async () => {
      process.env.GMAIL_SEND_MODE = "real";
      process.env.NOTIFICATION_EMAIL_MODE = "gmail";
      delete process.env.SMTP_PASS;
      resetEmailNotificationProvider();
      const res = await request(app)
        .post("/api/notifications/test-email")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 503);
      assert.equal(res.body.error, "Gmail not configured");
      process.env.GMAIL_SEND_MODE = "mock";
      process.env.NOTIFICATION_EMAIL_MODE = "mock";
      resetEmailNotificationProvider();
    });
  });

  describe("UI assets", () => {
    it("app hub has Gmail test card", () => {
      const html = fs.readFileSync(path.join(publicDir, "app-hub.html"), "utf8");
      const js = fs.readFileSync(path.join(publicDir, "js/app-hub.js"), "utf8");
      const css = fs.readFileSync(path.join(publicDir, "css/app-hub.css"), "utf8");
      assert.ok(html.includes("gmail-test-card"));
      assert.ok(html.includes("Gmail通知テスト"));
      assert.ok(js.includes("loadGmailTestCard"));
      assert.ok(js.includes("/api/notifications/test-email"));
      assert.ok(css.includes("gmail-status-warn"));
    });

    it(".env.production.example has SMTP vars", () => {
      const env = fs.readFileSync(
        path.join(repoRoot, "server/.env.production.example"),
        "utf8"
      );
      assert.ok(env.includes("SMTP_HOST=smtp.gmail.com"));
      assert.ok(env.includes("SMTP_PORT=587"));
      assert.ok(env.includes("SMTP_PASS="));
      assert.ok(env.includes("NOTIFICATION_EMAIL_MODE="));
      assert.ok(env.includes("NOTIFICATION_TEST_TO="));
    });
  });
});
