import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "url";

import { hashPassword, verifyPassword, isValidScryptPasswordHash, normalizeStoredPasswordHash } from "../src/auth/password.js";
import {
  buildPhase2381ProductionCheck,
  isInsecureAdminPasswordHash,
  resolveAdminPasswordStatus,
} from "../src/deploy/phase2381-production-check.js";
import { checkProductionEnv } from "../src/config/production-env-checker.js";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../src/pwa/pwa-shell-version.js";
import { resetEmailNotificationProvider } from "../src/notification/email-provider.js";

process.env.JWT_SECRET = "test-phase2381-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2381-2400.db";
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
const repoRoot = path.join(serverRoot, "..");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { disableTotp } = await import("../src/auth/totp.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");

const app = createApp();

describe("Phase 2381-2400 admin password recovery", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    disableTotp("admin-default");
    resetRateLimitsForTests();
  });

  after(() => {
    resetEmailNotificationProvider();
    closeDatabase();
  });

  describe("isInsecureAdminPasswordHash", () => {
    it("flags temp and non-scrypt values", () => {
      assert.equal(isInsecureAdminPasswordHash("temp"), true);
      assert.equal(isInsecureAdminPasswordHash("plaintext"), true);
      assert.equal(isInsecureAdminPasswordHash(""), true);
      assert.equal(isInsecureAdminPasswordHash(hashPassword("ok")), false);
    });

    it("flags truncated scrypt hash (122 hex chars)", () => {
      const truncated =
        "scrypt:0ab2548e75ab2ea7c501765685b86933:5496bc2d4817d8c4d25c210dcb65874907aa54322199d69a8e5ab6abbot46aa706fee706c9672a59b7079454b1e23c8a14cab15e83d64c4407e79c330";
      assert.equal(isValidScryptPasswordHash(truncated), false);
      assert.equal(isInsecureAdminPasswordHash(truncated), true);
      const r = resolveAdminPasswordStatus(truncated);
      assert.equal(r.ok, false);
      assert.equal(r.status, "RED");
      assert.match(r.detail, /128 文字/);
    });
  });

  describe("normalizeStoredPasswordHash", () => {
    it("strips quotes and CRLF", () => {
      const hash = hashPassword("secure");
      assert.equal(isValidScryptPasswordHash(`"${hash}"`), true);
      assert.equal(normalizeStoredPasswordHash(`${hash}\r`), hash);
    });
  });

  describe("resolveAdminPasswordStatus", () => {
    it("returns RED for temp", () => {
      const r = resolveAdminPasswordStatus("temp");
      assert.equal(r.ok, false);
      assert.equal(r.status, "RED");
    });

    it("returns GREEN for scrypt hash", () => {
      const r = resolveAdminPasswordStatus(hashPassword("secure"));
      assert.equal(r.ok, true);
      assert.equal(r.status, "GREEN");
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

    it("npm run hash:admin-password works", () => {
      const out = execSync('npm run hash:admin-password -- "npm-script-pass"', {
        cwd: serverRoot,
        encoding: "utf8",
      });
      assert.match(out, /^ADMIN_PASSWORD_HASH=scrypt:/m);
    });
  });

  describe("docs/admin-password-recovery.md", () => {
    it("exists with recovery steps", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/admin-password-recovery.md"), "utf8");
      assert.match(doc, /hash:admin-password/);
      assert.match(doc, /systemctl restart/);
      assert.match(doc, /test-email/);
    });
  });

  describe("checkProductionEnv", () => {
    it("errors on ADMIN_PASSWORD_HASH=temp in production", () => {
      const items = checkProductionEnv({
        NODE_ENV: "production",
        JWT_SECRET: "x".repeat(32),
        ADMIN_PASSWORD_HASH: "temp",
      });
      const admin = items.find((i) => i.key === "ADMIN_PASSWORD_HASH");
      assert.ok(admin);
      assert.equal(admin!.level, "error");
    });
  });

  describe("buildPhase2381ProductionCheck", () => {
    it("reports GREEN when scrypt hash configured", () => {
      const report = buildPhase2381ProductionCheck({
        ...process.env,
        ADMIN_PASSWORD_HASH: hashPassword("testpass"),
      });
      assert.equal(report.phase, "2381-2400");
      assert.equal(report.shellVersion, PWA_SHELL_VERSION);
      assert.equal(report.shellTag, PWA_SHELL_TAG);
      assert.equal(report.adminPasswordStatus, "GREEN");
      assert.ok(report.checks.every((c) => c.ok));
      assert.ok(report.ready);
      assert.ok(report.operationalReady);
    });

    it("reports RED when ADMIN_PASSWORD_HASH=temp", () => {
      const report = buildPhase2381ProductionCheck({
        ...process.env,
        ADMIN_PASSWORD_HASH: "temp",
      });
      assert.equal(report.adminPasswordStatus, "RED");
      assert.equal(report.ready, false);
      assert.equal(report.operationalReady, false);
      const runtime = report.checks.find((c) => c.id === "admin-password-hash-runtime");
      assert.ok(runtime);
      assert.equal(runtime!.ok, false);
      assert.equal(runtime!.status, "RED");
    });

    it("reports RED when scrypt hash is truncated", () => {
      const report = buildPhase2381ProductionCheck({
        ...process.env,
        ADMIN_PASSWORD_HASH:
          "scrypt:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      });
      assert.equal(report.adminPasswordStatus, "RED");
      const runtime = report.checks.find((c) => c.id === "admin-password-hash-runtime");
      assert.ok(runtime);
      assert.equal(runtime!.ok, false);
    });
  });

  describe("GET /api/deploy/production-check", () => {
    it("returns phase 2381 report JSON", async () => {
      const res = await request(app).get("/api/deploy/production-check");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2381-2400");
      assert.equal(res.body.adminPasswordStatus, "GREEN");
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
