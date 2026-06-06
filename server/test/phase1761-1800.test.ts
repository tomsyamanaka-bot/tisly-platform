import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildRc2CheckUrls } from "../src/config/production-routes.js";
import {
  buildDeployRehearsalChecklist,
  VPS_DEPLOY_COMMAND_STEPS,
} from "../src/deploy/deploy-rehearsal-checklist.js";

process.env.JWT_SECRET = "test-phase1761-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1761-1800.db";
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

const REAL_SECRET_PATTERN =
  /(?:JWT_SECRET|ADMIN_PASSWORD_HASH|INGEST_SECRET|DEPLOY_OPS_TOKEN|MQTT_PASSWORD)\s*=\s*(?!\s*$)(?!\s*ここ)[a-zA-Z0-9+/=$]{20,}/;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1761-1800 VPS Production Deploy Rehearsal", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("rehearsal checklist API", () => {
    it("GET /api/deploy/rehearsal-checklist returns status rows and env table", async () => {
      const res = await request(app).get("/api/deploy/rehearsal-checklist");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1761-1800");
      const ids = res.body.statusRows.map((r: { id: string }) => r.id);
      for (const id of [
        "github",
        "build",
        "test",
        "release_gate",
        "security",
        "env",
        "vps",
        "ssl",
        "pwa",
      ]) {
        assert.ok(ids.includes(id), `missing status row: ${id}`);
      }
      assert.ok(res.body.envChecklist.length >= 10);
      assert.ok(res.body.vpsCommands.length >= 10);
      assert.ok(!REAL_SECRET_PATTERN.test(JSON.stringify(res.body)), "API must not leak secrets");
    });

    it("buildDeployRehearsalChecklist env states use optional/missing/set", () => {
      const report = buildDeployRehearsalChecklist(process.env);
      const states = new Set(report.envChecklist.map((r) => r.state));
      assert.ok(states.has("set"), "expected at least one set env");
      assert.ok(
        states.has("optional") || states.has("missing"),
        "expected optional or missing env states",
      );
      const jwt = report.envChecklist.find((r) => r.key === "JWT_SECRET");
      assert.ok(jwt);
      assert.equal(jwt.state, "set");
      assert.equal(jwt.requirement, "required");
    });
  });

  describe("VPS command placeholders", () => {
    it("VPS_DEPLOY_COMMAND_STEPS has no real secrets", () => {
      const text = JSON.stringify(VPS_DEPLOY_COMMAND_STEPS);
      assert.ok(!REAL_SECRET_PATTERN.test(text));
      assert.ok(text.includes("ここに入れる"));
      assert.ok(text.includes("<VPSのIPアドレス>"));
      assert.ok(text.includes("<リポジトリURL>"));
      for (const step of [
        "ssh",
        "clone",
        "env",
        "npm_ci",
        "build",
        "release_gate",
        "db_init",
        "systemd",
        "nginx",
        "certbot",
        "health",
        "rollback",
      ]) {
        assert.ok(
          VPS_DEPLOY_COMMAND_STEPS.some((s) => s.id === step),
          `missing VPS step: ${step}`,
        );
      }
    });
  });

  describe("deployment checklist page enhanced", () => {
    it("GET /deployment/checklist includes Phase 1761 rehearsal UI", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("Phase 1761"));
      assert.ok(res.text.includes("VPS Production Rehearsal"));
      assert.ok(res.text.includes("VPS投入コマンドを見る"));
      assert.ok(res.text.includes("env 入力チェック表"));
      assert.ok(res.text.includes("安全ガード"));
    });

    it("deployment-checklist.js covers rehearsal API and modal", () => {
      const js = fs.readFileSync(
        path.join(serverRoot, "public/js/deployment-checklist.js"),
        "utf8",
      );
      for (const needle of [
        "/api/deploy/rehearsal-checklist",
        "renderRehearsalGrid",
        "renderEnvTable",
        "VPS投入コマンドを見る",
        "vps-cmd-btn",
        "rehearsalReady",
        "renderRehearsalGrid",
      ]) {
        assert.ok(js.includes(needle) || js.includes("rehearsal"), `missing in deployment-checklist.js: ${needle}`);
      }
      const urls = buildRc2CheckUrls("https://tisly.jp");
      assert.equal(urls.length, 9);
    });
  });

  describe("docs updated for Phase 1761", () => {
    it("rollback_guide.md has prominent first command", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/rollback_guide.md"), "utf8");
      assert.ok(doc.includes("1761"));
      assert.ok(doc.includes("失敗時に最初に打つコマンド"));
      assert.ok(doc.includes("cd /opt/tisly && bash scripts/rollback.sh"));
    });

    it("vps docs reference deployment checklist", () => {
      for (const rel of [
        "docs/vps_first_launch_for_tomonori.md",
        "docs/vps_copy_paste_commands.md",
        "docs/production_url_checklist.md",
      ]) {
        const doc = fs.readFileSync(path.join(repoRoot, rel), "utf8");
        assert.ok(doc.includes("1761") || doc.includes("deployment/checklist"), `${rel} not updated`);
      }
    });

    it("vps_copy_paste_commands.md still uses placeholders only", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/vps_copy_paste_commands.md"), "utf8");
      assert.ok(doc.includes("JWT_SECRET=ここに入れる"));
      assert.ok(!REAL_SECRET_PATTERN.test(doc));
    });
  });
});
