import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import { hashPassword } from "../src/auth/password.js";
import {
  buildDeployRehearsalChecklist,
  buildProductionStartInfo,
  VPS_DEPLOY_COMMAND_STEPS,
  VPS_PRODUCTION_START_MANUAL_BLOCK,
  VPS_PRODUCTION_START_ONE_BLOCK,
} from "../src/deploy/deploy-rehearsal-checklist.js";
import {
  resolveRepoRoot,
  resolveServerRoot,
  resolveVpsProductionStartScript,
  vpsProductionStartUsesSystemd,
} from "./repo-paths.js";

process.env.JWT_SECRET = "test-phase1801-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1801-1840.db";
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
const repoRoot = resolveRepoRoot(import.meta.url);
const serverRoot = resolveServerRoot(repoRoot);

const REAL_SECRET_PATTERN =
  /(?:JWT_SECRET|ADMIN_PASSWORD_HASH|INGEST_SECRET|DEPLOY_OPS_TOKEN|MQTT_PASSWORD)\s*=\s*(?!\s*$)(?!\s*ここ)[a-zA-Z0-9+/=$]{20,}/;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1801-1840 VPS Production Start Command Finalize", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("production start info", () => {
    it("buildProductionStartInfo recommends systemd not PM2", () => {
      const info = buildProductionStartInfo();
      assert.equal(info.method, "systemd");
      assert.ok(info.methodLabel.includes("systemd"));
      assert.ok(info.methodLabel.includes("PM2"));
      assert.equal(info.packageJson, "/opt/tisly/server/package.json");
      assert.equal(info.entryPoint, "/opt/tisly/server/dist/index.js");
      assert.equal(info.systemdUnit, "/etc/systemd/system/tisly-server.service");
      assert.equal(info.nginxConf, "/etc/nginx/sites-available/tisly.jp");
      assert.equal(info.envTemplate, "/opt/tisly/server/.env.production.example");
      assert.ok(info.startScript.includes("dist/index.js"));
    });

    it("VPS_PRODUCTION_START_ONE_BLOCK uses script; manual block covers full startup", () => {
      const script = VPS_PRODUCTION_START_ONE_BLOCK.join("\n");
      assert.ok(script.includes("vps-production-start.sh"));
      assert.ok(!REAL_SECRET_PATTERN.test(script));
      const manual = VPS_PRODUCTION_START_MANUAL_BLOCK.join("\n");
      for (const needle of [
        "npm run release:gate",
        "systemctl enable tisly-server",
        "nginx -t",
      ]) {
        assert.ok(manual.includes(needle), `manual missing: ${needle}`);
      }
      assert.ok(!manual.includes("pm2"), "production start must not use pm2");
    });

    it("vps-production-start.sh exists and uses systemd", () => {
      const script = resolveVpsProductionStartScript(repoRoot);
      assert.ok(script, `scripts/vps-production-start.sh missing (repoRoot=${repoRoot})`);
      const body = fs.readFileSync(script!, "utf8");
      assert.ok(vpsProductionStartUsesSystemd(body), "vps-production-start.sh must use systemd");
      assert.ok(
        body.includes("server/.env.production.example") || body.includes(".env.production.example"),
        "vps-production-start.sh must reference .env.production.example",
      );
    });
  });

  describe("rehearsal checklist API Phase 1801", () => {
    it("GET /api/deploy/rehearsal-checklist returns productionStart", async () => {
      const res = await request(app).get("/api/deploy/rehearsal-checklist");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1921-1960");
      assert.ok(res.body.productionStart);
      assert.equal(res.body.productionStart.method, "systemd");
      assert.ok(res.body.productionStart.oneBlock.length >= 1);
      assert.ok(
        res.body.productionStart.oneBlock.join("\n").includes("vps-production-start.sh"),
      );
      assert.ok(res.body.productionLaunch);
      assert.equal(res.body.productionLaunch.phase, "1921-1960");
      assert.ok(
        VPS_DEPLOY_COMMAND_STEPS.some((s) => s.id === "production_start"),
        "missing production_start step",
      );
      assert.ok(!REAL_SECRET_PATTERN.test(JSON.stringify(res.body)), "API must not leak secrets");
    });
  });

  describe("env template location", () => {
    it("server/.env.production.example is canonical; root is pointer only", () => {
      const serverTpl = path.join(serverRoot, ".env.production.example");
      const rootTpl = path.join(repoRoot, ".env.production.example");
      assert.ok(fs.existsSync(serverTpl), "server/.env.production.example required");
      assert.ok(fs.existsSync(rootTpl), "root .env.production.example pointer required");
      const rootBody = fs.readFileSync(rootTpl, "utf8");
      assert.ok(rootBody.includes("server/.env.production.example"));
      const serverBody = fs.readFileSync(serverTpl, "utf8");
      for (const key of ["JWT_SECRET", "ADMIN_PASSWORD_HASH", "INGEST_SECRET", "DEPLOY_OPS_TOKEN"]) {
        assert.ok(serverBody.includes(key), `server template missing ${key}`);
      }
    });

    it("docs/env_fill_in_guide.md references server template", () => {
      const guide = fs.readFileSync(path.join(repoRoot, "docs/env_fill_in_guide.md"), "utf8");
      assert.ok(guide.includes("server/.env.production.example"));
      assert.ok(guide.includes("/opt/tisly/server"));
    });
  });

  describe("deploy artifacts paths", () => {
    it("systemd and nginx templates exist under server/deploy", () => {
      assert.ok(fs.existsSync(path.join(serverRoot, "deploy/systemd/tisly-server.service")));
      assert.ok(fs.existsSync(path.join(serverRoot, "deploy/nginx/tisly.jp.conf")));
      const unit = fs.readFileSync(
        path.join(serverRoot, "deploy/systemd/tisly-server.service"),
        "utf8",
      );
      assert.ok(unit.includes("WorkingDirectory=/opt/tisly/server"));
      assert.ok(unit.includes("ExecStart=/usr/bin/node dist/index.js"));
      const nginx = fs.readFileSync(path.join(serverRoot, "deploy/nginx/tisly.jp.conf"), "utf8");
      assert.ok(nginx.includes("127.0.0.1:3080"));
      assert.ok(nginx.includes("/etc/nginx/sites-available/tisly.jp"));
    });
  });

  describe("deployment checklist page Phase 1801", () => {
    it("GET /deployment/checklist includes production start UI", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("本番起動コマンド"));
      assert.ok(
        res.text.includes("1921") ||
          res.text.includes("1841") ||
          res.text.includes("deployment/checklist"),
      );
    });

    it("package.json start script points to dist/index.js", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, "package.json"), "utf8"));
      assert.equal(pkg.main, "dist/index.js");
      assert.equal(pkg.scripts.start, "node dist/index.js");
    });
  });

  describe("buildDeployRehearsalChecklist status rows", () => {
    it("includes all checklist status ids", () => {
      const report = buildDeployRehearsalChecklist(process.env);
      const ids = report.statusRows.map((r) => r.id);
      for (const id of [
        "github",
        "build",
        "test",
        "release_gate",
        "env",
        "vps",
        "ssl",
        "pwa",
      ]) {
        assert.ok(ids.includes(id), `missing status row: ${id}`);
      }
    });
  });
});
