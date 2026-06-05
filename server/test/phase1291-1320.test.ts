import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  buildDeployDryRun,
  checkSecretLeakInGitDiff,
  checkUploadsGitignore,
  REQUIRED_ENV_KEYS,
} from "../src/deploy/deploy-dry-run.js";
import { buildPwaPublishAudit } from "../src/pwa/pwa-publish-audit.js";

process.env.JWT_SECRET = "test-phase1291-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1291-1320.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.DB_PROVIDER = "sqlite";
process.env.TISLY_DEMO_MODE = "false";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1291-1320 VPS Deploy Dry Run & Release Gate", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("deploy-dry-run unit", () => {
    it("buildDeployDryRun returns all check fields", () => {
      const report = buildDeployDryRun({
        NODE_ENV: "production",
        TISLY_PUBLIC_URL: "https://tisly.jp",
        JWT_SECRET: "a".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        MQTT_MODE: "mock",
        SHELLY_MODE: "mock",
        QNAP_UPLOAD_MODE: "mock",
        GMAIL_SEND_MODE: "mock",
      });

      assert.ok(report.generatedAt);
      assert.ok(Array.isArray(report.checks));
      assert.ok(report.checks.length >= 8);
      assert.ok(report.summary.pass + report.summary.fail + report.summary.warn === report.checks.length);
      assert.equal(report.isProductionUrl, true);
      assert.ok(report.productionUrls.length >= 9);
      assert.ok(report.productionUrls.every((u) => u.startsWith("https://tisly.jp/")));
      assert.ok(report.mockItems.length >= 5);
      assert.ok(report.secretLeakCheck);
      assert.ok(report.uploadsGitignore);
      assert.ok(report.pwaAudit.pwAs.length >= 7);
      assert.ok(typeof report.googleTvCaution === "string");
    });

    it("REQUIRED_ENV_KEYS covered in .env.production.example", () => {
      const content = fs.readFileSync(
        path.join(serverRoot, ".env.production.example"),
        "utf8"
      );
      for (const key of REQUIRED_ENV_KEYS) {
        assert.ok(content.includes(`${key}=`), `missing ${key}`);
      }
    });

    it("fails when TISLY_PUBLIC_URL is localhost in audit context", () => {
      const report = buildDeployDryRun({
        NODE_ENV: "production",
        TISLY_PUBLIC_URL: "http://localhost:3080",
        JWT_SECRET: "b".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
      });
      assert.equal(report.isProductionUrl, false);
      const survey = report.pwaAudit.pwAs.find((p) => p.id === "survey");
      assert.ok(survey);
      assert.equal(survey.installReady, false);
    });
  });

  describe("secret leak prevention", () => {
    it("passes on empty template secrets in diff", () => {
      const diff = "+JWT_SECRET=\n+ADMIN_PASSWORD_HASH=\n";
      const result = checkSecretLeakInGitDiff(diff);
      assert.equal(result.passed, true);
      assert.equal(result.findings.length, 0);
    });

    it("fails when real JWT_SECRET appears in diff", () => {
      const diff = "+JWT_SECRET=super-secret-production-key-32chars!!\n";
      const result = checkSecretLeakInGitDiff(diff);
      assert.equal(result.passed, false);
      assert.ok(result.findings.some((f) => f.includes("JWT_SECRET")));
    });

    it("fails when server/.env is added", () => {
      const diff = "+++ b/server/.env\n+JWT_SECRET=leaked\n";
      const result = checkSecretLeakInGitDiff(diff);
      assert.equal(result.passed, false);
    });
  });

  describe("uploads gitignore", () => {
    it("server/uploads is gitignored", () => {
      const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
      const result = checkUploadsGitignore(gitignore);
      assert.equal(result.passed, true);
    });
  });

  describe("release-gate API", () => {
    it("GET /api/deploy/dry-run returns dry-run JSON", async () => {
      const res = await request(app).get("/api/deploy/dry-run");
      assert.equal(res.status, 200);
      assert.ok(res.body.checks);
      assert.ok(typeof res.body.passed === "boolean");
      assert.ok(res.body.productionUrls);
      assert.ok(res.body.secretLeakCheck);
      assert.ok(res.body.uploadsGitignore);
      assert.ok(res.body.pwaAudit);
    });

    it("GET /api/deploy/release-gate includes releaseGate", async () => {
      const res = await request(app).get("/api/deploy/release-gate");
      assert.equal(res.status, 200);
      assert.ok(res.body.releaseGate);
      assert.ok(["pass", "fail"].includes(res.body.releaseGate.status));
      assert.ok(Array.isArray(res.body.releaseGate.steps));
      assert.ok(res.body.releaseGate.steps.some((s: { id: string }) => s.id === "dry_run"));
    });
  });

  describe("production URL mismatch", () => {
    it("publish-audit production URLs match RC2 routes for tisly.jp", () => {
      const audit = buildPwaPublishAudit({ TISLY_PUBLIC_URL: "https://tisly.jp" });
      const report = buildDeployDryRun({ TISLY_PUBLIC_URL: "https://tisly.jp" });
      const pwaCheck = report.checks.find((c) => c.id === "pwa_urls_match");
      assert.ok(pwaCheck);
      assert.equal(pwaCheck.status, "pass");
      assert.equal(audit.pwAs.filter((p) => p.isPwa).length, 7);
    });
  });

  describe("app publish card", () => {
    it("/app HTML includes release gate elements", async () => {
      const res = await request(app).get("/app");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("release-gate-banner"));
      assert.ok(res.text.includes("publish-gate-summary"));
      assert.ok(res.text.includes("publish-gate-checks"));
      assert.ok(res.text.includes("publish-dry-run-last"));
      assert.ok(res.text.includes("本番公開チェック"));
    });

    it("app-hub.js uses release-gate API", () => {
      const js = fs.readFileSync(path.join(serverRoot, "public/js/app-hub.js"), "utf8");
      assert.ok(js.includes("/api/deploy/release-gate"));
      assert.ok(js.includes("release-gate-banner"));
      assert.ok(js.includes("secretLeakCheck"));
      assert.ok(js.includes("googleTvCaution"));
    });

    it("docs/release_gate.md exists with pass/fail criteria", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/release_gate.md"), "utf8");
      assert.ok(doc.includes("合格"));
      assert.ok(doc.includes("不合格"));
      assert.ok(doc.includes("mock"));
      assert.ok(doc.includes("real"));
      assert.ok(doc.includes("iPhone"));
      assert.ok(doc.includes("Android"));
    });
  });
});
