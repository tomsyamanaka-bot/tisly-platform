import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildFieldOperationsAudit } from "../src/field-operations/field-operations-audit.js";

process.env.JWT_SECRET = "test-phase1621-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1621-1680.db";
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

describe("Phase 1621-1680 Field Operations Enhancement", () => {
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
      .send({ customerCode: "TOMS001", siteName: "現場運用テスト", address: "東京都" });
    assert.equal(survey.status, 201);
    surveyProjectId = survey.body.projectId;

    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await request(app)
      .post("/api/survey/photo")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        projectId: surveyProjectId,
        photos: [{ photoType: "camera", imageBase64: tinyPng, fileName: "cam.jpg" }],
      });

    const biz = await request(app)
      .post(`/api/business/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    assert.equal(biz.status, 201);
    businessProjectId = biz.body.project?.id ?? biz.body.id;
  });

  after(() => closeDatabase());

  describe("field_operations_v1.md", () => {
    it("docs exist with workflow", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/field_operations_v1.md"), "utf8");
      for (const needle of [
        "現調",
        "見積",
        "施工",
        "引渡し",
        "保守",
        "/survey",
        "/assets",
        "/install",
        "estimate-v4",
      ]) {
        assert.ok(doc.includes(needle), `missing: ${needle}`);
      }
    });
  });

  describe("GET /api/field-operations/audit", () => {
    it("returns Field Ready audit with verdict", async () => {
      const report = buildFieldOperationsAudit();
      assert.equal(report.phase, "1681-1720");
      assert.ok(report.checks.length >= 8);
      assert.ok(["FIELD_READY", "FIELD_WARNING", "FIELD_NOT_READY"].includes(report.verdict));

      const res = await request(app).get("/api/field-operations/audit");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1681-1720");
      assert.ok(res.body.fieldReadyRate >= 0);
    });
  });

  describe("survey enhancements", () => {
    it("POST reverse-geocode", async () => {
      const res = await request(app)
        .post("/api/survey/reverse-geocode")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ lat: 35.68, lng: 139.76, projectId: surveyProjectId });
      assert.equal(res.status, 200);
      assert.ok(res.body.address);
    });

    it("GET business-link for survey project", async () => {
      const res = await request(app)
        .get(`/api/field-operations/survey/${surveyProjectId}/business-link`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.businessProjectId, businessProjectId);
    });
  });

  describe("estimate v4 from project", () => {
    it("POST /api/field-operations/projects/:id/estimate-v4", async () => {
      const res = await request(app)
        .post(`/api/field-operations/projects/${businessProjectId}/estimate-v4`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ runAnalysis: true });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.phase, "1621-1680");
      assert.ok(res.body.estimate.estimateNo);
      const categories = res.body.candidates.map((c: { category: string }) => c.category);
      for (const cat of ["LAN", "Camera", "ESP", "Shelly", "電源", "工事費"]) {
        assert.ok(categories.includes(cat), `missing category ${cat}`);
      }
    });
  });

  describe("assets registry", () => {
    it("POST qr/create then GET /api/field-operations/assets", async () => {
      await request(app)
        .post("/api/assets/qr/create")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          customerCode: "TOMS001",
          deviceId: "ESP-FO-001",
          deviceKind: "ESP",
          label: "制御盤FO",
        });

      const res = await request(app)
        .get("/api/field-operations/assets?customerCode=TOMS001")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.assets.length >= 1);
      assert.ok(res.body.summary.total >= 1);
      const kinds = ["ESP", "Shelly", "Camera", "SwitchBot", "Sensor"];
      assert.deepEqual(res.body.kinds, kinds);
    });
  });

  describe("install session", () => {
    it("POST session start and complete", async () => {
      const start = await request(app)
        .post("/api/customer/TOMS001/install/session/start")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mode: "live" });
      assert.equal(start.status, 201);
      assert.ok(start.body.id);

      const complete = await request(app)
        .post("/api/customer/TOMS001/install/session/complete")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ sessionId: start.body.id });
      assert.equal(complete.status, 200);
    });
  });

  describe("maintenance with replacement parts", () => {
    it("POST report + parts", async () => {
      const report = await request(app)
        .post("/api/maintenance/report")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ customerCode: "TOMS001", comment: "点検完了 FO" });
      assert.equal(report.status, 201);
      assert.ok(report.body.reportId);

      const parts = await request(app)
        .post(`/api/field-operations/maintenance/reports/${report.body.reportId}/parts`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          customerCode: "TOMS001",
          parts: [{ partName: "PoEスイッチ", quantity: 1 }],
        });
      assert.equal(parts.status, 201);
      assert.equal(parts.body.parts[0].partName, "PoEスイッチ");
    });
  });

  describe("customer portal field-view", () => {
    it("GET /api/customer/TOMS001/field-view", async () => {
      const res = await request(app)
        .get("/api/customer/TOMS001/field-view")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(Array.isArray(res.body.devices));
      assert.ok(Array.isArray(res.body.maintenanceHistory));
      assert.ok(Array.isArray(res.body.notificationHistory));
    });
  });

  describe("KPI", () => {
    it("GET /api/field-operations/kpi", async () => {
      const res = await request(app)
        .get("/api/field-operations/kpi")
        .set("Authorization", `Bearer ${managerToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "1621-1680");
      assert.ok(typeof res.body.revenue === "number");
      assert.ok(typeof res.body.grossProfit === "number");
      assert.ok(Array.isArray(res.body.monthlyProjects));
      assert.ok(typeof res.body.uninvoiced === "number");
    });
  });

  describe("page routes", () => {
    it("serves /assets, /install, /survey, /maintenance", async () => {
      for (const route of ["/assets", "/install", "/survey", "/maintenance"]) {
        const res = await request(app).get(route);
        assert.equal(res.status, 200, route);
        assert.match(res.text, /html/i, route);
      }
    });

    it("static assets exist", () => {
      for (const f of [
        "public/assets.html",
        "public/install-hub.html",
        "public/js/assets.js",
        "public/js/install-hub.js",
      ]) {
        assert.ok(fs.existsSync(path.join(serverRoot, f)), f);
      }
    });
  });
});
