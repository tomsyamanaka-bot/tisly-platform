import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";

import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { buildPhase2380ProductionCheck } from "../src/deploy/phase2380-production-check.js";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../src/pwa/pwa-shell-version.js";
import { resetEmailNotificationProvider } from "../src/notification/email-provider.js";

process.env.JWT_SECRET = "test-phase2351-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2351-2380.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.REQUIRE_2FA = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.NOTIFICATION_EMAIL_MODE = "mock";
process.env.NOTIFICATION_TEST_TO = "test-recipient@example.com";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { disableTotp } = await import("../src/auth/totp.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");

const app = createApp();

describe("Phase 2351-2380 admin password hash", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    disableTotp("admin-default");
    resetRateLimitsForTests();
  });

  after(() => {
    resetEmailNotificationProvider();
    closeDatabase();
  });

  describe("verifyPassword", () => {
    it("rejects plaintext ADMIN_PASSWORD_HASH=temp", () => {
      assert.equal(verifyPassword("temp", "temp"), false);
    });

    it("accepts scrypt hash from hashPassword", () => {
      const hash = hashPassword("secure-admin-pass");
      assert.ok(hash.startsWith("scrypt:"));
      assert.equal(verifyPassword("secure-admin-pass", hash), true);
      assert.equal(verifyPassword("wrong", hash), false);
    });
  });

  describe("hash-admin-password.mjs script", () => {
    it("outputs scrypt ADMIN_PASSWORD_HASH line", () => {
      const out = execSync('node scripts/hash-admin-password.mjs "script-test-pass"', {
        cwd: serverRoot,
        encoding: "utf8",
      });
      assert.match(out, /^ADMIN_PASSWORD_HASH=scrypt:[0-9a-f]+:[0-9a-f]+$/m);
      const hash = out.match(/^ADMIN_PASSWORD_HASH=(.+)$/m)?.[1];
      assert.ok(hash);
      assert.equal(verifyPassword("script-test-pass", hash), true);
    });

    it("exits non-zero without password arg", () => {
      assert.throws(
        () =>
          execSync("node scripts/hash-admin-password.mjs", {
            cwd: serverRoot,
            encoding: "utf8",
            stdio: "pipe",
          }),
        (err: NodeJS.ErrnoException) => err.status !== 0
      );
    });
  });

  describe("buildPhase2380ProductionCheck", () => {
    it("reports admin hash readiness", () => {
      const report = buildPhase2380ProductionCheck();
      assert.equal(report.phase, "2351-2380");
      assert.equal(report.shellVersion, PWA_SHELL_VERSION);
      assert.equal(report.shellTag, PWA_SHELL_TAG);
      assert.ok(report.implemented.length >= 3);
      assert.ok(report.checks.every((c) => c.ok));
      assert.ok(report.ready);
      assert.ok(report.operationalReady);
    });
  });

  describe("GET /api/deploy/production-check-2380", () => {
    it("returns phase 2380 report JSON", async () => {
      const res = await request(app).get("/api/deploy/production-check-2380");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2351-2380");
      assert.ok(res.body.operationalReady);
    });
  });

  describe("POST /api/auth/login", () => {
    it("fails when ADMIN_PASSWORD_HASH is plaintext temp", async () => {
      const prev = process.env.ADMIN_PASSWORD_HASH;
      process.env.ADMIN_PASSWORD_HASH = "temp";
      resetRateLimitsForTests();
      disableTotp("admin-default");

      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "temp" });

      process.env.ADMIN_PASSWORD_HASH = prev;
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Invalid credentials");
    });

    it("succeeds with valid scrypt hash", async () => {
      resetRateLimitsForTests();
      disableTotp("admin-default");
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "testpass" });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
      assert.equal(res.body.user.username, "admin");
    });
  });

  describe("POST /api/notifications/test-email", () => {
    it("requires admin Bearer token", async () => {
      const res = await request(app).post("/api/notifications/test-email");
      assert.equal(res.status, 401);
    });

    it("succeeds with admin token", async () => {
      resetRateLimitsForTests();
      disableTotp("admin-default");
      const login = await request(app)
        .post("/api/auth/login")
        .send({ username: "admin", password: "testpass" });
      assert.equal(login.status, 200);

      const res = await request(app)
        .post("/api/notifications/test-email")
        .set("Authorization", `Bearer ${login.body.token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });
});
