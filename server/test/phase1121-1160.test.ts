import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-phase1121-secret";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1121-1160.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";

const dbPath = process.env.TISLY_DB_PATH;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let adminToken = "";
let managerToken = "";
let surveyProjectId = "";
let businessProjectId = "";

describe("Phase 1121-1160 Field Deployment RC1", () => {
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
      .send({ customerCode: "TOMS001", siteName: "RC1現調", address: "東京都" });
    assert.equal(survey.status, 201);
    surveyProjectId = survey.body.projectId;
  });

  after(() => closeDatabase());

  it("POST /api/survey/photo (bulk)", async () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const res = await request(app)
      .post("/api/survey/photo")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        projectId: surveyProjectId,
        photos: [
          { photoType: "camera", imageBase64: tinyPng, fileName: "cam1.jpg" },
          { photoType: "panel", imageBase64: tinyPng, fileName: "panel1.jpg" },
        ],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.count, 2);
  });

  it("POST /api/survey/reverse-geocode", async () => {
    const res = await request(app)
      .post("/api/survey/reverse-geocode")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ lat: 35.68, lng: 139.76, projectId: surveyProjectId });
    assert.equal(res.status, 200);
    assert.ok(res.body.address);
    assert.equal(res.body.source, "rule-based");
  });

  it("POST /api/ai/survey-analysis v4", async () => {
    const res = await request(app)
      .post("/api/ai/survey-analysis")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ surveyProjectId });
    assert.equal(res.status, 201);
    assert.equal(res.body.version, "v4");
    assert.ok(res.body.analysis.cameraCount >= 2);
    assert.ok(res.body.analysis.espCount >= 1);
    assert.ok(res.body.analysis.manHours >= 4);
  });

  it("POST /api/business/from-survey + estimate/generate", async () => {
    const biz = await request(app)
      .post(`/api/business/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    assert.equal(biz.status, 201, JSON.stringify(biz.body));
    businessProjectId = biz.body.project?.id ?? biz.body.id;
    assert.ok(businessProjectId);

    const est = await request(app)
      .post("/api/business/estimate/generate")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ projectId: businessProjectId, runAnalysis: false });
    assert.equal(est.status, 201);
    assert.ok(est.body.estimate.estimateNo);
    assert.ok(est.body.tomsFormat.materials.length >= 3);
  });

  it("POST /api/assets/qr/create + history", async () => {
    const create = await request(app)
      .post("/api/assets/qr/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerCode: "TOMS001",
        deviceId: "ESP-RC1-001",
        deviceKind: "ESP",
        label: "制御盤1",
      });
    assert.equal(create.status, 201);
    assert.ok(create.body.assetId);
    assert.ok(create.body.svg.includes("svg"));

    const reissue = await request(app)
      .post("/api/assets/qr/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerCode: "TOMS001",
        deviceId: "ESP-RC1-001",
        deviceKind: "ESP",
        label: "制御盤1",
        reissue: true,
      });
    assert.equal(reissue.status, 200);

    const hist = await request(app)
      .get("/api/assets/qr/history?customerCode=TOMS001")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(hist.status, 200);
    assert.ok(hist.body.history.length >= 2);
  });

  it("GET /api/maintenance/schedule + POST report", async () => {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    await request(app)
      .post("/api/maintenance/schedule")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerCode: "TOMS001",
        title: "月次点検 RC1",
        dueDate: due.toISOString().slice(0, 10),
      });

    const sched = await request(app)
      .get("/api/maintenance/schedule?customerCode=TOMS001")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(sched.status, 200);
    assert.ok(sched.body.schedules.length >= 1);

    const scheduleId = sched.body.schedules[0].scheduleId;
    const report = await request(app)
      .post("/api/maintenance/report")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerCode: "TOMS001", scheduleId, comment: "点検完了" });
    assert.equal(report.status, 201);
    assert.equal(report.body.comment, "点検完了");
  });

  it("GET /api/timeline unified", async () => {
    const res = await request(app)
      .get(`/api/timeline?projectId=${businessProjectId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.events.length >= 1);
  });

  it("GET dashboard RC + POST /api/tv/focus-camera", async () => {
    const dash = await request(app)
      .get(`/api/toms/projects/${businessProjectId}/dashboard?rc=1`)
      .set("Authorization", `Bearer ${managerToken}`);
    assert.equal(dash.status, 200);
    assert.equal(dash.body.phase, "1121-1160");
    assert.ok(dash.body.rcCards.length >= 5);

    const tv = await request(app).post("/api/tv/focus-camera").send({
      customerCode: "TOMS001",
      cameraId: "CAM-RC1-01",
      floor: "perimeter",
      trigger: "sensor",
    });
    assert.equal(tv.status, 201);
    assert.ok(tv.body.event === "focusCamera" || tv.body.event === "camera_focus");
    assert.equal(tv.body.viewLabel, "外周");
  });
});
