import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildDeployLayoutAudit } from "../src/deploy/deploy-layout-audit.js";
import { buildDeployDryRun } from "../src/deploy/deploy-dry-run.js";
import { buildFieldOperationsAudit } from "../src/field-operations/field-operations-audit.js";

process.env.JWT_SECRET = "test-phase1681-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1681-1720.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";
let managerToken = "";
let surveyProjectId = "";
let businessProjectId = "";

describe("Phase 1681-1720 Field Operations UX Polish", () => {
  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    assert.equal(login.status, 200);
    adminToken = login.body.token;

    const mgr = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    assert.equal(mgr.status, 200);
    managerToken = mgr.body.token;

    const survey = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerCode: "TOMS001", siteName: "UX磨きテスト", address: "東京都" });
    assert.equal(survey.status, 201);
    surveyProjectId = survey.body.projectId;

    const biz = await request(app)
      .post(`/api/business/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    assert.equal(biz.status, 201);
    businessProjectId = biz.body.project?.id ?? biz.body.id;
  });

  after(() => closeDatabase());

  describe("field_operations_v1.md Phase 1681", () => {
    it("docs include field flow sections", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/field_operations_v1.md"), "utf8");
      for (const needle of [
        "Phase 1681",
        "現場での使い方",
        "施工員用の流れ",
        "現調用の流れ",
        "顧客引渡しの流れ",
        "PRO Remote連携の流れ",
        "FIELD_WARNING",
        "pro-remote-sync",
      ]) {
        assert.ok(doc.includes(needle), `missing: ${needle}`);
      }
    });
  });

  describe("GET /api/field-operations/audit", () => {
    it("returns enhanced Field Ready audit", async () => {
      const report = buildFieldOperationsAudit();
      assert.equal(report.phase, "1681-1720");
      assert.ok(typeof report.surveyReady === "boolean");
      assert.ok(typeof report.projectReady === "boolean");
      assert.ok(typeof report.installReady === "boolean");
      assert.ok(typeof report.maintenanceReady === "boolean");
      assert.ok(typeof report.customerHandoverReady === "boolean");
      assert.ok(typeof report.proRemoteLinked === "boolean");
      assert.ok(typeof report.fieldReadyRate === "number");
      assert.ok(["FIELD_READY", "FIELD_WARNING", "FIELD_NOT_READY"].includes(report.verdict));

      const res = await request(app).get("/api/field-operations/audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1681-1720");
      assert.ok(res.body.surveyReady);
      assert.ok(res.body.fieldReadyRate >= 50);
    });
  });

  describe("survey mobile UX assets", () => {
    it("survey.html has new UX elements", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/survey.html"), "utf8");
      for (const needle of [
        "btn-survey-new-case",
        "survey-category-bar",
        "btn-survey-photo-add",
        "btn-survey-ai-estimate",
        "1681",
      ]) {
        assert.ok(html.includes(needle), needle);
      }
    });
  });

  describe("project dashboard field actions", () => {
    it("project-dashboard has workflow cards and actions", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/project-dashboard.html"), "utf8");
      assert.ok(html.includes("btn-field-estimate"));
      assert.ok(html.includes("btn-field-pro-remote"));
      const js = fs.readFileSync(path.join(serverRoot, "public/js/project-dashboard.js"), "utf8");
      assert.ok(js.includes("bindFieldActionButtons"));
    });

    it("GET dashboard rc cards include handover", async () => {
      const res = await request(app)
        .get(`/api/toms/projects/${businessProjectId}/dashboard?rc=1`)
        .set("Authorization", `Bearer ${managerToken}`);
      assert.equal(res.status, 200);
      const ids = (res.body.rcCards ?? []).map((c: { id: string }) => c.id);
      assert.ok(ids.includes("handover"));
      assert.ok(ids.includes("survey_info"));
      assert.ok(ids.includes("ai_estimate"));
    });
  });

  describe("POST pro-remote-sync", () => {
    it("syncs survey media to PRO Remote tiers", async () => {
      const res = await request(app)
        .post(`/api/field-operations/projects/${businessProjectId}/pro-remote-sync`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.phase, "1681-1720");
      assert.deepEqual(res.body.tiers, ["perimeter", "1f", "2f"]);
      assert.equal(res.body.roofCreated, false);
    });
  });

  describe("PRO Remote field media", () => {
    it("floor-stack rc2 includes fieldMedia", async () => {
      const res = await request(app)
        .get("/api/customer/TOMS001/pro-remote/floor-stack?rc=2")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      const layers = res.body.layers ?? [];
      assert.ok(layers.length >= 3);
      for (const layer of layers) {
        assert.ok(Array.isArray(layer.fieldMedia));
      }
      const tiers = layers.map((l: { tier: string }) => l.tier);
      assert.ok(tiers.includes("perimeter"));
      assert.ok(tiers.includes("1f"));
      assert.ok(tiers.includes("2f"));
      assert.ok(!tiers.includes("roof"));
    });
  });

  describe("customer handover card", () => {
    it("customer-portal.html has handover card", () => {
      const html = fs.readFileSync(path.join(serverRoot, "public/customer-portal.html"), "utf8");
      assert.ok(html.includes("handover-card"));
      assert.ok(html.includes("引渡し確認"));
    });

    it("GET handover API", async () => {
      const res = await request(app)
        .get("/api/customer/TOMS001/handover")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      const pkg = res.body.handover ?? res.body;
      assert.ok(Array.isArray(pkg.equipment));
      assert.ok(pkg.proRemoteUrl);
    });
  });

  describe("Deploy Layout Fix & GitHub Sync", () => {
    it("buildDeployLayoutAudit uses server/public not root web/", () => {
      const report = buildDeployLayoutAudit(repoRoot);
      assert.equal(report.phase, "1681-1720");
      assert.equal(report.verdict, "READY");
      const pub = report.checks.find((c) => c.id === "server_public");
      assert.ok(pub?.exists, "server/public required");
      const legacy = report.checks.find((c) => c.id === "legacy_web_optional");
      assert.ok(legacy);
      assert.equal(legacy?.required, false);
      assert.ok(report.notes.some((n) => n.includes("web/ は不要")));
    });

    it("README documents tisly-platform vs TiSLY_HOME_Security_DEMO", () => {
      const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
      for (const needle of [
        "tisly-platform",
        "TiSLY_HOME_Security_DEMO",
        "/opt/tisly/server",
        "server/public",
        "web/",
      ]) {
        assert.ok(readme.includes(needle), `README missing: ${needle}`);
      }
    });

    it("root .env.production.example points to server template", () => {
      const rootEnv = fs.readFileSync(path.join(repoRoot, ".env.production.example"), "utf8");
      assert.ok(rootEnv.includes("server/.env.production.example"));
      assert.ok(rootEnv.includes("env_fill_in_guide.md"));
    });

    it("deploy dry-run includes layout check with server/public", () => {
      const dryRun = buildDeployDryRun(process.env);
      const layout = dryRun.checks.find((c) => c.id === "deploy_layout");
      assert.ok(layout);
      assert.equal(layout?.status, "pass");
      assert.ok(layout?.message.includes("server/public"));
    });

    it("GET /api/deploy/layout-audit returns READY", async () => {
      const res = await request(app).get("/api/deploy/layout-audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1681-1720");
      assert.equal(res.body.verdict, "READY");
      assert.ok(res.body.readyCount >= 8);
    });

    it("vps-first-deploy-check.sh validates server/public", () => {
      const sh = fs.readFileSync(path.join(repoRoot, "scripts/vps-first-deploy-check.sh"), "utf8");
      assert.ok(sh.includes("server/public"));
      assert.ok(sh.includes("web/ 不要"));
      assert.ok(sh.includes(".env.production.example"));
    });
  });

  describe("install and maintenance UX pages", () => {
    it("installer-home workflow cards", async () => {
      const res = await request(app).get("/customer/TOMS001/install/home");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("installer-workflow"));
      assert.ok(res.text.includes("card-checklist"));
    });

    it("maintenance unified dashboard", async () => {
      const res = await request(app).get("/maintenance");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("maint-dashboard"));
      assert.ok(res.text.includes("maint-next-date"));
    });
  });
});
