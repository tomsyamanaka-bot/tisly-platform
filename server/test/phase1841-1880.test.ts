import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  buildProductionLaunchGuide,
  PRODUCTION_ENV_EXAMPLE_PLACEHOLDER,
  VPS_ENV_PREP_ONE_BLOCK,
  VPS_FAILURE_BRANCHES,
  VPS_PRODUCTION_START_MANUAL_BLOCK,
  VPS_PRODUCTION_START_ONE_BLOCK,
  VPS_PRODUCTION_VERIFY_ONE_BLOCK,
} from "../src/deploy/deploy-rehearsal-checklist.js";

process.env.JWT_SECRET = "test-phase1841-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1841-1880.db";
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

describe("Phase 1841-1880 VPS Production Launch Support & Env Final Check", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("launch guide blocks", () => {
    it("VPS_ENV_PREP_ONE_BLOCK has openssl and hashPassword without real secrets", () => {
      const text = VPS_ENV_PREP_ONE_BLOCK.join("\n");
      assert.ok(!REAL_SECRET_PATTERN.test(text));
      for (const needle of [
        "openssl rand -base64 48",
        "openssl rand -hex 32",
        "hashPassword",
        "YOUR_STRONG_PASSWORD",
        "nano .env",
      ]) {
        assert.ok(text.includes(needle), `missing: ${needle}`);
      }
    });

    it("VPS_PRODUCTION_START_ONE_BLOCK uses vps-production-start.sh", () => {
      const text = VPS_PRODUCTION_START_ONE_BLOCK.join("\n");
      assert.ok(text.includes("bash scripts/vps-production-start.sh"));
      assert.ok(!REAL_SECRET_PATTERN.test(text));
    });

    it("VPS_PRODUCTION_VERIFY_ONE_BLOCK covers post-start checks", () => {
      const text = VPS_PRODUCTION_VERIFY_ONE_BLOCK.join("\n");
      for (const needle of [
        "systemctl",
        "tisly-server",
        "nginx -t",
        "127.0.0.1:3080/api/health",
        "https://tisly.jp/app",
      ]) {
        assert.ok(text.includes(needle), `missing: ${needle}`);
      }
      assert.ok(
        text.includes("curl -I") || text.includes("curl -sI"),
        "verify block must curl tisly.jp/app headers",
      );
    });

    it("VPS_PRODUCTION_START_MANUAL_BLOCK remains as fallback", () => {
      const text = VPS_PRODUCTION_START_MANUAL_BLOCK.join("\n");
      assert.ok(text.includes("npm run release:gate"));
      assert.ok(text.includes("systemctl enable tisly-server"));
    });

    it("VPS_FAILURE_BRANCHES covers five failure modes", () => {
      const ids = VPS_FAILURE_BRANCHES.map((b) => b.id);
      for (const id of [
        "env_missing",
        "port_3080_down",
        "nginx_error",
        "certbot_missing",
        "bad_gateway_502",
      ]) {
        assert.ok(ids.includes(id), `missing branch: ${id}`);
      }
    });

    it("PRODUCTION_ENV_EXAMPLE_PLACEHOLDER has placeholders only", () => {
      assert.ok(!REAL_SECRET_PATTERN.test(PRODUCTION_ENV_EXAMPLE_PLACEHOLDER));
      assert.ok(PRODUCTION_ENV_EXAMPLE_PLACEHOLDER.includes("ここに入れる"));
      assert.ok(PRODUCTION_ENV_EXAMPLE_PLACEHOLDER.includes("openssl rand"));
    });

    it("buildProductionLaunchGuide has A–F sections", () => {
      const guide = buildProductionLaunchGuide();
      assert.equal(guide.phase, "1921-1960");
      assert.ok(guide.sectionA_now.includes("bash scripts/vps-production-start.sh"));
      assert.ok(guide.sectionB_vpsCommands.includes("openssl rand -base64 48"));
      assert.ok(guide.sectionC_envExample.includes("JWT_SECRET="));
      assert.ok(guide.sectionD_success.includes("active"));
      assert.ok(guide.sectionE_failure.includes("502"));
      assert.ok(guide.sectionF_urls.includes("https://tisly.jp/app"));
      assert.equal(guide.failureBranches.length, 5);
    });
  });

  describe("docs vps_phase1841_launch.md", () => {
    it("exists with A–F sections and openssl commands", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/vps_phase1841_launch.md"), "utf8");
      for (const section of [
        "## A.",
        "## B.",
        "## C.",
        "## D.",
        "## E.",
        "## F.",
        "openssl rand -base64 48",
        "openssl rand -hex 32",
        "hashPassword",
        "502 Bad Gateway",
      ]) {
        assert.ok(doc.includes(section), `doc missing: ${section}`);
      }
    });
  });

  describe("rehearsal checklist API Phase 1841", () => {
    it("GET /api/deploy/rehearsal-checklist returns productionLaunch", async () => {
      const res = await request(app).get("/api/deploy/rehearsal-checklist");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1921-1960");
      assert.ok(res.body.productionLaunch);
      assert.equal(res.body.productionLaunch.phase, "1921-1960");
      assert.ok(res.body.productionLaunch.envPrepBlock.length >= 5);
      assert.ok(res.body.productionLaunch.verifyBlock.length >= 4);
      assert.ok(res.body.productionLaunch.failureBranches.length === 5);
      assert.ok(!REAL_SECRET_PATTERN.test(JSON.stringify(res.body)), "API must not leak secrets");
    });
  });

  describe("deployment checklist page Phase 1841", () => {
    it("GET /deployment/checklist includes Phase 1841 launch UI", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(
        res.text.includes("1921") ||
          res.text.includes("1841") ||
          res.text.includes("本番起動コマンド"),
      );
      assert.ok(res.text.includes("本番起動コマンド"));
      assert.ok(res.text.includes("env準備") || res.text.includes("env 準備"));
    });
  });
});
