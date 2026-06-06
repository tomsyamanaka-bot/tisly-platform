import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildRc2CheckUrls } from "../src/config/production-routes.js";

process.env.JWT_SECRET = "test-phase1501-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1501-1540.db";
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

describe("Phase 1501-1540 VPS Deploy Execution Assistant", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("VPS shell scripts", () => {
    it("vps-first-deploy-check.sh covers required checks", () => {
      const sh = fs.readFileSync(path.join(repoRoot, "scripts/vps-first-deploy-check.sh"), "utf8");
      for (const needle of [
        "node",
        "npm",
        "git",
        "nginx",
        "certbot",
        "systemctl",
        "/opt/tisly",
        ".env",
        "JWT_SECRET",
        "ADMIN_PASSWORD_HASH",
        "INGEST_SECRET",
        "TISLY_PUBLIC_URL",
        "DEPLOY_OPS_TOKEN",
        "MQTT_MODE",
        "node_modules",
        "dist/index.js",
        "nginx -t",
        "tisly-server",
        "3080",
        "/api/health",
        "/app",
      ]) {
        assert.ok(sh.includes(needle), `missing in vps-first-deploy-check.sh: ${needle}`);
      }
    });

    it("vps-deploy-one-command.sh runs full deploy flow", () => {
      const sh = fs.readFileSync(path.join(repoRoot, "scripts/vps-deploy-one-command.sh"), "utf8");
      for (const needle of [
        "git pull",
        "npm ci",
        "npm run build",
        "npm run release:gate",
        "npm run db:init",
        "systemctl restart",
        "nginx -t",
        "systemctl reload nginx",
        "/api/health",
        "/app",
        "/survey",
        "/business",
        "/sales",
      ]) {
        assert.ok(sh.includes(needle), `missing in vps-deploy-one-command.sh: ${needle}`);
      }
    });
  });

  describe("env production setup doc", () => {
    it("docs/env_production_setup.md lists required keys without secrets", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/env_production_setup.md"), "utf8");
      const required = [
        "JWT_SECRET",
        "ADMIN_PASSWORD_HASH",
        "INGEST_SECRET",
        "TISLY_PUBLIC_URL=https://tisly.jp",
        "DEPLOY_OPS_TOKEN",
        "MQTT_MODE",
        "MQTT_URL",
        "MQTT_SUBSCRIBER_ENABLED",
        "SHELLY_MODE",
        "QNAP_UPLOAD_MODE",
        "GOOGLE_OAUTH_ENABLED",
        "GMAIL_SEND_MODE",
        "DEMO_RESET_ENABLED=false",
      ];
      for (const key of required) {
        assert.ok(doc.includes(key), `missing in env_production_setup.md: ${key}`);
      }
      assert.ok(!doc.match(/[a-f0-9]{32,}/), "doc must not contain real hex secrets");
      assert.ok(doc.includes("本物のパスワード"), "security warning expected");
    });

    it(".env.production.example has DEPLOY_OPS_TOKEN", () => {
      const content = fs.readFileSync(path.join(serverRoot, ".env.production.example"), "utf8");
      assert.ok(content.includes("DEPLOY_OPS_TOKEN="));
    });
  });

  describe("nginx production final", () => {
    it("tisly.jp.conf has HSTS gzip security headers and routes", () => {
      const conf = fs.readFileSync(path.join(serverRoot, "deploy/nginx/tisly.jp.conf"), "utf8");
      for (const needle of [
        "return 301 https",
        "location /api/",
        "location /ws",
        "gzip on",
        "Strict-Transport-Security",
        "X-Frame-Options",
        "Cache-Control",
        "/app|survey|business|sales",
        "/customer/",
        "/tv/",
        "/deployment/",
      ]) {
        assert.ok(conf.includes(needle) || new RegExp(needle).test(conf), `missing: ${needle}`);
      }
    });
  });

  describe("deployment checklist page", () => {
    it("GET /deployment/checklist serves production checklist HTML", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("本番公開チェックリスト"));
      assert.ok(res.text.includes("9 本番 URL"));
      assert.ok(res.text.includes("iPhone Safari"));
      assert.ok(res.text.includes("Android Chrome"));
    });

    it("deployment-checklist.js probes 9 URLs and release-gate", () => {
      const js = fs.readFileSync(
        path.join(serverRoot, "public/js/deployment-checklist.js"),
        "utf8"
      );
      assert.ok(js.includes("/api/deploy/release-gate"));
      assert.ok(js.includes("/api/deploy/audit"));
      assert.ok(js.includes("/api/health"));
      assert.ok(js.includes("pwaInstallAudit"));
      const urls = buildRc2CheckUrls("https://tisly.jp");
      assert.equal(urls.length, 9);
      for (const u of urls) {
        const pathOnly = u.replace("https://tisly.jp", "");
        assert.ok(js.includes(pathOnly), `JS missing path ${pathOnly}`);
      }
    });
  });

  describe("docs updated", () => {
    it("tisly_vps_deploy_step_by_step references VPS scripts", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/tisly_vps_deploy_step_by_step.md"),
        "utf8"
      );
      assert.ok(doc.includes("vps-first-deploy-check.sh"));
      assert.ok(doc.includes("vps-deploy-one-command.sh"));
      assert.ok(doc.includes("env_production_setup.md"));
    });

    it("rc2_pre_deploy_checklist references deployment checklist page", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/rc2_pre_deploy_checklist.md"), "utf8");
      assert.ok(doc.includes("/deployment/checklist"));
      assert.ok(doc.includes("vps-first-deploy-check.sh"));
    });
  });
});
