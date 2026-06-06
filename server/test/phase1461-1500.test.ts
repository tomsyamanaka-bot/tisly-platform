import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  appendDeployHistory,
  buildDeployCenterStatus,
  listDeployHistory,
} from "../src/deploy/deploy-history.js";
import { buildProductionAudit } from "../src/deploy/production-audit.js";
import { probeHealth } from "../src/deploy/health-monitor.js";
import { runDeployBackup } from "../src/deploy/deploy-backup.js";

process.env.JWT_SECRET = "test-phase1461-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1461-1500.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.QNAP_MODE = "mock";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.SWITCHBOT_MODE = "mock";
process.env.DB_PROVIDER = "sqlite";
process.env.TISLY_DEMO_MODE = "false";
process.env.DEMO_RESET_ENABLED = "false";
process.env.INGEST_SECRET = "test-ingest-secret-ok-value";
process.env.DEPLOY_OPS_TOKEN = "test-deploy-ops-token";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");
const historyFile = path.join(serverRoot, "data", "deploy-history.json");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1461-1500 ConoHa VPS Auto Deployment", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);
  });

  after(() => closeDatabase());

  describe("deploy center API", () => {
    it("GET /api/deploy/center returns commit build deploy status", async () => {
      const res = await request(app).get("/api/deploy/center");
      assert.equal(res.status, 200);
      assert.ok(res.body.currentCommit);
      assert.ok(res.body.currentBuild);
      assert.ok(res.body.deployStatus);
      assert.ok(res.body.healthProbe);
    });

    it("release-gate includes deployCenter", async () => {
      const res = await request(app).get("/api/deploy/release-gate");
      assert.equal(res.status, 200);
      assert.ok(res.body.deployCenter);
    });
  });

  describe("production audit API", () => {
    it("GET /api/deploy/audit returns 8 categories", async () => {
      const res = await request(app).get("/api/deploy/audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.items.length, 8);
      const labels = res.body.items.map((i: { label: string }) => i.label);
      for (const label of ["HTTPS", "WSS", "Systemd", "Nginx", "Disk", "Memory", "DB", "MQTT"]) {
        assert.ok(labels.includes(label), `missing audit: ${label}`);
      }
    });

    it("buildProductionAudit unit", async () => {
      const report = await buildProductionAudit();
      assert.equal(report.items.length, 8);
      assert.equal(report.phase, "1461-1500-conoha-vps-auto-deploy");
    });
  });

  describe("deploy history", () => {
    it("append and list deploy history", () => {
      appendDeployHistory({
        type: "deploy",
        commit: "abc123def456",
        commitShort: "abc123d",
        build: "RC2-1500",
        status: "success",
        message: "test deploy",
        actor: "test",
      });
      const all = listDeployHistory();
      assert.ok(all.length >= 1);
      const center = buildDeployCenterStatus();
      assert.equal(center.deployStatus, "success");
    });

    it("GET /api/deploy/history returns builds deploys rollbacks", async () => {
      appendDeployHistory({
        type: "rollback",
        commit: "abc123def456",
        commitShort: "abc123d",
        build: "RC2-1500",
        status: "rolled_back",
        message: "test rollback",
        actor: "test",
      });
      const res = await request(app).get("/api/deploy/history");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.deploys));
      assert.ok(Array.isArray(res.body.rollbacks));
      assert.ok(res.body.buildVersion);
    });
  });

  describe("rollback API", () => {
    it("POST /api/deploy/rollback requires token", async () => {
      const res = await request(app).post("/api/deploy/rollback");
      assert.equal(res.status, 403);
    });

    it("POST /api/deploy/rollback with token records event", async () => {
      const res = await request(app)
        .post("/api/deploy/rollback")
        .set("X-Deploy-Ops-Token", "test-deploy-ops-token");
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });

  describe("health monitor", () => {
    it("probeHealth returns ok in test", () => {
      const probe = probeHealth();
      assert.equal(probe.ok, true);
    });

    it("GET /api/deploy/health-monitor", async () => {
      const res = await request(app).get("/api/deploy/health-monitor");
      assert.equal(res.status, 200);
      assert.ok(res.body.lastProbe);
    });
  });

  describe("deploy backup", () => {
    it("runDeployBackup creates manifest", () => {
      const result = runDeployBackup(repoRoot);
      assert.ok(result.backupDir.includes("backup"));
      assert.ok(result.files.some((f) => f.endsWith("manifest.json")));
    });
  });

  describe("UI and scripts", () => {
    it("app-hub has Deploy Center card", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/app-hub.html"), "utf8");
      assert.ok(html.includes("Deploy Center"));
      assert.ok(html.includes("deploy-center-card"));
      assert.ok(html.includes("btn-deploy-rollback"));
    });

    it("app-hub.js renders deploy center", () => {
      const js = fs.readFileSync(path.join(serverRoot, "public/js/app-hub.js"), "utf8");
      assert.ok(js.includes("renderDeployCenter"));
      assert.ok(js.includes("requestRollback"));
    });

    it("app-version page and route exist", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/app-version.html"), "utf8");
      assert.ok(html.includes("Version History"));
      assert.ok(html.includes("version-deploy-list"));
    });

    it("GitHub Actions deploy workflow exists", () => {
      const wf = fs.readFileSync(path.join(repoRoot, ".github/workflows/deploy.yml"), "utf8");
      assert.ok(wf.includes("release-gate"));
      assert.ok(wf.includes("npm run release:gate"));
      assert.ok(wf.includes("branches: [master]"));
    });

    it("deploy.sh and rollback.sh exist", () => {
      const deploySh = fs.readFileSync(path.join(repoRoot, "scripts/deploy.sh"), "utf8");
      const rollbackSh = fs.readFileSync(path.join(repoRoot, "scripts/rollback.sh"), "utf8");
      assert.ok(deploySh.includes("git pull"));
      assert.ok(deploySh.includes("npm run release:gate"));
      assert.ok(deploySh.includes("systemctl restart"));
      assert.ok(deploySh.includes("nginx"));
      assert.ok(rollbackSh.includes("git reset"));
      assert.ok(rollbackSh.includes("systemctl restart"));
    });
  });
});
