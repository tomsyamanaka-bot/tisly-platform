import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildRc2CheckUrls } from "../src/config/production-routes.js";

process.env.JWT_SECRET = "test-phase1541-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1541-1580.db";
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
const serverRoot = path.join(repoRoot, "server");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1541-1580 VPS Deploy Final Human Guide", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("Human guide docs", () => {
    it("docs/vps_first_launch_for_tomonori.md is beginner-friendly", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/vps_first_launch_for_tomonori.md"),
        "utf8"
      );
      for (const needle of [
        "智紀さんが入力",
        "ssh root@",
        "/opt/tisly",
        "git clone",
        "npm ci",
        "npm run build",
        "npm run release:gate",
        "npm run db:init",
        "systemctl",
        "nginx",
        "certbot",
        "vps-first-deploy-check.sh",
        "iPhone",
        "deployment/checklist",
      ]) {
        assert.ok(doc.includes(needle), `missing in vps_first_launch_for_tomonori.md: ${needle}`);
      }
    });

    it("docs/env_fill_in_guide.md explains secrets without real values", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/env_fill_in_guide.md"), "utf8");
      for (const key of [
        "JWT_SECRET",
        "ADMIN_PASSWORD_HASH",
        "INGEST_SECRET",
        "DEPLOY_OPS_TOKEN",
        "openssl rand -base64 48",
        "hashPassword",
      ]) {
        assert.ok(doc.includes(key), `missing in env_fill_in_guide.md: ${key}`);
      }
      assert.ok(!doc.match(/[a-f0-9]{48,}/), "doc must not contain real hex secrets");
      assert.ok(doc.includes("本物"), "security warning expected");
    });

    it("docs/production_check_commands.md has curl examples", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/production_check_commands.md"),
        "utf8"
      );
      for (const path of [
        "/api/health",
        "/api/deploy/preflight",
        "/api/deploy/release-gate",
        "/app",
        "/survey",
        "/business",
        "/sales",
        "/tv/TOMS001",
      ]) {
        assert.ok(doc.includes(path), `missing curl path: ${path}`);
      }
    });

    it("docs/rollback_guide.md references rollback.sh", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/rollback_guide.md"), "utf8");
      assert.ok(doc.includes("scripts/rollback.sh"));
      assert.ok(doc.includes("systemctl restart"));
      assert.ok(doc.includes("nginx"));
      assert.ok(doc.includes("/api/health"));
    });

    it("README points to vps_first_launch_for_tomonori.md", () => {
      const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
      assert.ok(readme.includes("docs/vps_first_launch_for_tomonori.md"));
    });
  });

  describe("VPS scripts enhanced", () => {
    it("vps-first-deploy-check.sh has colors and READY banner", () => {
      const sh = fs.readFileSync(path.join(repoRoot, "scripts/vps-first-deploy-check.sh"), "utf8");
      for (const needle of [
        "C_GREEN",
        "C_RED",
        "MISSING_ENV_KEYS",
        "次にやること",
        "READY FOR DEPLOY",
        "NOT READY",
        "env_fill_in_guide.md",
      ]) {
        assert.ok(sh.includes(needle), `missing in vps-first-deploy-check.sh: ${needle}`);
      }
    });

    it("rollback.sh reloads nginx and verifies health", () => {
      const sh = fs.readFileSync(path.join(repoRoot, "scripts/rollback.sh"), "utf8");
      for (const needle of [
        "nginx -t",
        "systemctl reload nginx",
        "/api/health",
        "/app",
        "/deployment/checklist",
        "git reset --hard HEAD~1",
      ]) {
        assert.ok(sh.includes(needle), `missing in rollback.sh: ${needle}`);
      }
    });
  });

  describe("deployment checklist page enhanced", () => {
    it("GET /deployment/checklist includes Google TV and mock/real sections", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("Google TV"));
      assert.ok(res.text.includes("mock / real"));
      assert.ok(res.text.includes("service worker"));
    });

    it("deployment-checklist.js covers integrations and preflight", () => {
      const js = fs.readFileSync(
        path.join(serverRoot, "public/js/deployment-checklist.js"),
        "utf8"
      );
      for (const needle of [
        "/api/deploy/preflight",
        "/api/deploy/release-gate",
        "/api/deploy/audit",
        "/api/health",
        "GOOGLE_TV_CHECKS",
        "INTEGRATION_SERVICES",
        "service-worker.js",
        "READY",
        "NOT READY",
        "Gmail",
        "QNAP",
        "MQTT",
        "Shelly",
      ]) {
        assert.ok(js.includes(needle), `missing in deployment-checklist.js: ${needle}`);
      }
      const urls = buildRc2CheckUrls("https://tisly.jp");
      assert.equal(urls.length, 9);
    });
  });
});
