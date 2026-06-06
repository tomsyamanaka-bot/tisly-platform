import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  buildProductionLaunchGuide,
  buildProductionVerificationGuide,
  PRODUCTION_BROWSER_TEST_URLS,
  VPS_BROWSER_SMOKE_ONE_BLOCK,
  VPS_CHECKLIST_STATUS_VERIFY_BLOCK,
  VPS_GIT_PULL_START_ONE_BLOCK,
  VPS_PRODUCTION_VERIFY_ONE_BLOCK,
} from "../src/deploy/deploy-rehearsal-checklist.js";

process.env.JWT_SECRET = "test-phase1921-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1921-1960.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.DEMO_RESET_ENABLED = "false";
process.env.INGEST_SECRET = "test-ingest-secret-ok-value";
process.env.DEPLOY_OPS_TOKEN = "test-deploy-ops-token";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const REAL_SECRET_PATTERN =
  /(?:JWT_SECRET|ADMIN_PASSWORD_HASH|INGEST_SECRET|DEPLOY_OPS_TOKEN|MQTT_PASSWORD)\s*=\s*(?!\s*$)(?!\s*ここ)(?!<)[a-zA-Z0-9+/=$]{20,}/;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1921-1960 Production Launch Verification & Browser Test", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("verification guide blocks", () => {
    it("VPS_GIT_PULL_START_ONE_BLOCK uses git pull and vps-production-start.sh", () => {
      const text = VPS_GIT_PULL_START_ONE_BLOCK.join("\n");
      assert.ok(text.includes("git pull"));
      assert.ok(text.includes("bash scripts/vps-production-start.sh"));
      assert.ok(!REAL_SECRET_PATTERN.test(text));
    });

    it("VPS_PRODUCTION_VERIFY_ONE_BLOCK covers post-start and checklist", () => {
      const text = VPS_PRODUCTION_VERIFY_ONE_BLOCK.join("\n");
      for (const needle of [
        "systemctl is-active tisly-server",
        "nginx -t",
        "127.0.0.1:3080/api/health",
        "https://tisly.jp/app",
        "deployment/checklist",
      ]) {
        assert.ok(text.includes(needle), `missing: ${needle}`);
      }
    });

    it("VPS_CHECKLIST_STATUS_VERIFY_BLOCK targets vps ssl pwa rows", () => {
      const text = VPS_CHECKLIST_STATUS_VERIFY_BLOCK.join("\n");
      assert.ok(text.includes("rehearsal-checklist"));
      assert.ok(text.includes("vps"));
      assert.ok(text.includes("ssl"));
      assert.ok(text.includes("pwa"));
      assert.ok(text.includes("VPS DEPLOYED"));
      assert.ok(text.includes("SSL READY"));
    });

    it("VPS_BROWSER_SMOKE_ONE_BLOCK covers 9 production paths", () => {
      const text = VPS_BROWSER_SMOKE_ONE_BLOCK.join("\n");
      for (const p of [
        "/app",
        "/survey",
        "/business",
        "/sales",
        "/customer/TOMS001",
        "/deployment/checklist",
      ]) {
        assert.ok(text.includes(p), `missing path: ${p}`);
      }
    });

    it("PRODUCTION_BROWSER_TEST_URLS prioritizes /app first", () => {
      assert.equal(PRODUCTION_BROWSER_TEST_URLS[0].path, "/app");
      assert.equal(PRODUCTION_BROWSER_TEST_URLS[0].priority, 1);
      assert.ok(PRODUCTION_BROWSER_TEST_URLS.some((u) => u.path === "/deployment/checklist"));
      assert.ok(PRODUCTION_BROWSER_TEST_URLS.some((u) => u.path === "/api/health"));
    });

    it("buildProductionVerificationGuide has A–D sections", () => {
      const guide = buildProductionVerificationGuide();
      assert.equal(guide.phase, "1921-1960");
      assert.ok(guide.sectionA_urls.length >= 10);
      assert.ok(guide.sectionA_urls[0].includes("/app"));
      assert.ok(guide.sectionB_success.includes("VPS DEPLOYED"));
      assert.ok(guide.sectionB_success.includes("SSL READY"));
      assert.ok(guide.sectionB_success.includes("installReady"));
      assert.ok(guide.sectionC_failure.includes("502"));
      assert.ok(guide.sectionD_nextPhase.includes("1961"));
      assert.equal(guide.failureBranches.length, 5);
      assert.ok(guide.postDeployVerifyBlock.length >= 5);
      assert.ok(guide.checklistStatusVerifyBlock.length >= 3);
    });

    it("buildProductionLaunchGuide updated to phase 1921", () => {
      const guide = buildProductionLaunchGuide();
      assert.equal(guide.phase, "1921-1960");
      assert.ok(guide.sectionA_now.includes("deployment/checklist"));
      assert.ok(guide.sectionD_success.includes("SSL READY"));
      assert.ok(guide.startBlock.join("\n").includes("git pull"));
    });
  });

  describe("docs vps_phase1921_launch.md", () => {
    it("exists with A–D sections and checklist verification", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/vps_phase1921_launch.md"), "utf8");
      for (const section of [
        "## A.",
        "## B.",
        "## C.",
        "## D.",
        "VPS DEPLOYED",
        "SSL READY",
        "installReady",
        "502 Bad Gateway",
        "certbot",
        "https://tisly.jp/app",
        "LAUNCH VERIFIED",
      ]) {
        assert.ok(doc.includes(section), `doc missing: ${section}`);
      }
    });
  });

  describe("rehearsal checklist API Phase 1921", () => {
    it("GET /api/deploy/rehearsal-checklist returns productionVerification", async () => {
      const res = await request(app).get("/api/deploy/rehearsal-checklist");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1921-1960");
      assert.ok(res.body.productionVerification);
      assert.equal(res.body.productionVerification.phase, "1921-1960");
      assert.ok(res.body.productionVerification.browserTestUrls.length >= 10);
      assert.ok(res.body.productionVerification.gitPullStartBlock.length >= 1);
      assert.ok(!REAL_SECRET_PATTERN.test(JSON.stringify(res.body)), "API must not leak secrets");
    });
  });

  describe("deployment checklist page Phase 1921", () => {
    it("GET /deployment/checklist includes Phase 1921 verification UI", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("1921") || res.text.includes("Phase 1921"));
      assert.ok(res.text.includes("起動後確認"));
    });
  });
});
