import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildDeployPreflight } from "../src/deploy/deploy-preflight.js";
import { buildVpsDeployStatus } from "../src/deploy/vps-deploy-status.js";
import { getBuildVersion } from "../src/deploy/build-version.js";
import { buildDeployDryRun, buildReleaseGateInfo } from "../src/deploy/deploy-dry-run.js";

process.env.JWT_SECRET = "test-phase1441-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1441-1460.db";
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

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1441-1460 VPS Real Deploy Preparation", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("deploy preflight API", () => {
    it("GET /api/deploy/preflight returns categories and missing list", async () => {
      const res = await request(app).get("/api/deploy/preflight");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.categories));
      assert.ok(Array.isArray(res.body.missing));
      const ids = res.body.categories.map((c: { id: string }) => c.id);
      assert.ok(ids.includes("NODE_ENV"));
      assert.ok(ids.includes("TISLY_PUBLIC_URL"));
      assert.ok(ids.includes("JWT"));
      assert.ok(ids.includes("ADMIN"));
      assert.ok(ids.includes("DB"));
      assert.ok(ids.includes("MQTT"));
      assert.ok(ids.includes("QNAP"));
      assert.ok(ids.includes("GMAIL"));
      assert.ok(ids.includes("SHELLY"));
      assert.ok(ids.includes("SwitchBot"));
    });

    it("buildDeployPreflight unit covers all categories", () => {
      const report = buildDeployPreflight(process.env);
      assert.equal(report.categories.length, 10);
      assert.ok(report.categories.every((c) => c.label));
    });
  });

  describe("VPS deploy status", () => {
    it("buildVpsDeployStatus has 9 items", () => {
      const dryRun = buildDeployDryRun(
        { TISLY_PUBLIC_URL: "https://tisly.jp" },
        { includeReleaseGate: true }
      );
      const status = buildVpsDeployStatus({
        ...dryRun,
        releaseGate: buildReleaseGateInfo(dryRun),
      });
      assert.equal(status.items.length, 9);
      const labels = status.items.map((i) => i.label);
      assert.ok(labels.includes("Build"));
      assert.ok(labels.includes("Release Gate"));
      assert.ok(labels.includes("Deploy Dry Run"));
      assert.ok(labels.includes("WebSocket"));
      assert.ok(labels.includes("Deploy Ready"));
    });

    it("release-gate API includes vpsDeployStatus and buildVersion", async () => {
      const res = await request(app).get("/api/deploy/release-gate");
      assert.equal(res.status, 200);
      assert.ok(res.body.vpsDeployStatus);
      assert.ok(Array.isArray(res.body.vpsDeployStatus.items));
      assert.ok(res.body.buildVersion);
      assert.equal(res.body.buildVersion.label, "TiSLY RC2");
    });
  });

  describe("health API enhancement", () => {
    it("GET /api/health includes buildVersion uptime database websocket productionUrl", async () => {
      const res = await request(app).get("/api/health");
      assert.equal(res.status, 200);
      assert.ok(res.body.buildVersion);
      assert.equal(res.body.buildVersion.label, "TiSLY RC2");
      assert.ok(typeof res.body.uptime === "number");
      assert.ok(res.body.database);
      assert.ok(res.body.websocket);
      assert.equal(res.body.productionUrl, "https://tisly.jp");
      assert.equal(res.body.phase, "1461-1500-conoha-vps-auto-deploy");
    });
  });

  describe("build version", () => {
    it("getBuildVersion returns RC2 label", () => {
      const v = getBuildVersion();
      assert.equal(v.label, "TiSLY RC2");
      assert.ok(v.build);
      assert.ok(v.date);
    });
  });

  describe("app hub UI", () => {
    it("app-hub.html has VPS Deploy Status card and version footer", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/app-hub.html"), "utf8");
      assert.ok(html.includes("VPS Deploy Status"));
      assert.ok(html.includes("vps-deploy-status-card"));
      assert.ok(html.includes("app-version-footer"));
      assert.ok(html.includes("version-build"));
    });

    it("app-hub.js renders vps deploy status and build version", () => {
      const js = fs.readFileSync(path.join(serverRoot, "public/js/app-hub.js"), "utf8");
      assert.ok(js.includes("renderVpsDeployStatus"));
      assert.ok(js.includes("renderBuildVersion"));
      assert.ok(js.includes("vpsDeployStatus"));
      assert.ok(js.includes("buildVersion"));
    });
  });

  describe("documentation", () => {
    it("docs/preflight_checklist.md exists with required items", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/preflight_checklist.md"), "utf8");
      for (const item of [
        "git pull",
        "npm ci",
        "build",
        "test",
        "release gate",
        "env",
        "nginx",
        "ssl",
        "systemd",
        "health",
        "app",
        "survey",
        "business",
        "installer",
        "customer",
        "pro-remote",
        "tv",
      ]) {
        assert.ok(doc.toLowerCase().includes(item), `missing checklist item: ${item}`);
      }
    });

    it("docs/deploy_report_template.md exists", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/deploy_report_template.md"), "utf8");
      assert.ok(doc.includes("デプロイレポート"));
      assert.ok(doc.includes("buildVersion"));
    });
  });
});
