import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  buildProductionSimulation,
  buildPwaRehearsalAudit,
  buildSecurityRehearsalAudit,
  buildTvRehearsalAudit,
  buildUrlCheck,
  calculateReadyScore,
} from "../src/deploy/production-rehearsal.js";
import { buildDeployDryRun } from "../src/deploy/deploy-dry-run.js";

process.env.JWT_SECRET = "test-phase1581-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1581-1620.db";
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

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1581-1620 Production Deployment Rehearsal", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("production_rehearsal.md", () => {
    it("docs exist with execution and GO criteria", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/production_rehearsal.md"),
        "utf8"
      );
      for (const needle of [
        "Phase 1581",
        "/api/deploy/simulate",
        "/api/deploy/url-check",
        "/api/deploy/pwa-audit",
        "/api/deploy/tv-audit",
        "/api/deploy/security-audit",
        "READY FOR PRODUCTION",
        "npm run release:gate",
        "智紀さん",
        "VPS 投入 GO",
      ]) {
        assert.ok(doc.includes(needle), `missing: ${needle}`);
      }
    });
  });

  describe("url-check", () => {
    it("covers 9 RC2 routes", () => {
      const report = buildUrlCheck();
      assert.equal(report.total, 9);
      const paths = report.entries.map((e) => e.path);
      for (const p of [
        "/app",
        "/survey",
        "/business",
        "/sales",
        "/customer/TOMS001",
        "/customer/TOMS001/pro-remote",
        "/customer/TOMS001/install/home",
        "/tv/TOMS001",
        "/deployment/checklist",
      ]) {
        assert.ok(paths.includes(p), `missing path ${p}`);
      }
    });

    it("GET /api/deploy/url-check returns JSON", async () => {
      const res = await request(app).get("/api/deploy/url-check");
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 9);
      assert.ok(typeof res.body.readyRate === "number");
    });
  });

  describe("pwa-audit", () => {
    it("audits 7 PWAs with installReady checks", () => {
      const report = buildPwaRehearsalAudit();
      assert.equal(report.totalPwa, 7);
      assert.ok(report.entries.every((e) => e.installReady));
      assert.ok(report.entries.every((e) => e.manifest));
      assert.ok(report.entries.every((e) => e.serviceWorker));
    });

    it("GET /api/deploy/pwa-audit", async () => {
      const res = await request(app).get("/api/deploy/pwa-audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.totalPwa, 7);
    });
  });

  describe("tv-audit", () => {
    it("checks tv route, focus api, camera focus, ws", () => {
      const report = buildTvRehearsalAudit();
      const ids = report.checks.map((c) => c.id);
      assert.deepEqual(ids, ["tv_route", "focus_api", "camera_focus", "ws"]);
      assert.equal(report.checks.filter((c) => c.status === "pass").length, 4);
      assert.equal(report.verdict, "READY");
    });

    it("GET /api/deploy/tv-audit", async () => {
      const res = await request(app).get("/api/deploy/tv-audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.verdict, "READY");
    });
  });

  describe("security-audit", () => {
    it("checks env, jwt, secret, admin hash, debug, mock", () => {
      const report = buildSecurityRehearsalAudit();
      assert.ok(report.envFile);
      assert.ok(report.jwt.status === "pass");
      assert.ok(report.secret.status === "pass");
      assert.ok(report.adminHash.status === "pass");
      assert.equal(report.verdict, "READY");
    });

    it("GET /api/deploy/security-audit", async () => {
      const res = await request(app).get("/api/deploy/security-audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.verdict, "READY");
    });
  });

  describe("simulate + ready score", () => {
    it("buildProductionSimulation returns verdict and sections", () => {
      const sim = buildProductionSimulation();
      assert.equal(sim.phase, "1581-1620");
      assert.ok(sim.sections.releaseGate);
      assert.ok(sim.sections.health);
      assert.ok(sim.sections.build);
      assert.ok(sim.sections.nginx);
      assert.ok(sim.sections.ws);
      assert.ok(sim.sections.pwa);
      assert.ok(sim.sections.env);
      assert.ok(sim.readyScore.total >= 0);
      assert.ok(sim.readyScore.maxTotal === 100);
      assert.ok(Array.isArray(sim.readyScore.categories));
      assert.equal(sim.readyScore.categories.length, 7);
    });

    it("GET /api/deploy/simulate", async () => {
      const res = await request(app).get("/api/deploy/simulate");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1581-1620");
      assert.ok(res.body.readyScore);
      assert.ok(res.body.summary);
    });

    it("calculateReadyScore labels 97+ as READY FOR PRODUCTION", () => {
      const dryRun = buildDeployDryRun();
      const urlCheck = buildUrlCheck();
      const pwaAudit = buildPwaRehearsalAudit();
      const tvAudit = buildTvRehearsalAudit();
      const securityAudit = buildSecurityRehearsalAudit();

      const score = calculateReadyScore({
        dryRun,
        urlCheck,
        pwaAudit,
        tvAudit,
        securityAudit,
        healthOk: true,
        releaseGatePass: true,
        buildOk: true,
        testOk: true,
      });

      assert.ok(score.total >= 90);
      if (score.total >= 97) {
        assert.equal(score.label, "READY FOR PRODUCTION");
      }
    });
  });

  describe("app hub Deployment Summary UI", () => {
    it("app-hub.html has rehearsal summary card", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/app-hub.html"), "utf8");
      assert.ok(html.includes("rehearsal-summary-card"));
      assert.ok(html.includes("Deployment Summary"));
      assert.ok(html.includes("btn-rehearsal-refresh"));
    });

    it("app-hub.js fetches /api/deploy/simulate", () => {
      const js = fs.readFileSync(path.join(serverRoot, "public/js/app-hub.js"), "utf8");
      assert.ok(js.includes("/api/deploy/simulate"));
      assert.ok(js.includes("renderRehearsalSummary"));
    });
  });
});
