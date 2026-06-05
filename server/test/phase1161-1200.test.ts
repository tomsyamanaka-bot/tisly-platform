import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-phase1161-secret";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1161-1200.db";
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
let fieldProjectId = "";
let surveyProjectId = "";
let businessProjectId = "";

describe("Phase 1161-1200 Field Deployment RC2", () => {
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
  });

  after(() => closeDatabase());

  it("POST /api/field/projects/create + GET /api/field/projects/:id", async () => {
    const due = new Date();
    due.setDate(due.getDate() + 3);
    const create = await request(app)
      .post("/api/field/projects/create")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        customerCode: "TOMS001",
        customerName: "RC2試験顧客",
        address: "東京都渋谷区1-1",
        buildingType: "detached_house",
        planCandidates: ["standard", "premium"],
        surveyStaff: "現調太郎",
        scheduledDate: due.toISOString().slice(0, 10),
        memo: "初回顧客トライアル",
      });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    assert.equal(create.body.phase, "1161-1200");
    fieldProjectId = create.body.fieldProject.id;
    surveyProjectId = create.body.surveyProjectId;
    businessProjectId = create.body.businessProjectId;
    assert.ok(fieldProjectId.startsWith("FLD-"));
    assert.ok(surveyProjectId.startsWith("SVY-"));
    assert.ok(businessProjectId.startsWith("BIZ-"));

    const get = await request(app)
      .get(`/api/field/projects/${fieldProjectId}`)
      .set("Authorization", `Bearer ${managerToken}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.fieldProject.businessProjectId, businessProjectId);
  });

  it("POST /api/ai/survey-analysis-v2 + estimate-draft", async () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await request(app)
      .post("/api/survey/photo")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        projectId: surveyProjectId,
        photos: [{ photoType: "camera", imageBase64: tinyPng, fileName: "rc2.jpg" }],
      });

    const ai = await request(app)
      .post("/api/ai/survey-analysis-v2")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ surveyProjectId });
    assert.equal(ai.status, 201);
    assert.equal(ai.body.version, "v2");
    assert.ok(ai.body.estimate_candidates.length >= 5);
    assert.ok(Array.isArray(ai.body.risk_notes));
    assert.ok(Array.isArray(ai.body.missing_info));

    const draft = await request(app)
      .post(`/api/business/projects/${businessProjectId}/estimate-draft`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ runAnalysis: false });
    assert.equal(draft.status, 201);
    assert.equal(draft.body.draft.version, "v2");
    assert.ok(draft.body.draft.lines.length >= 5);
    assert.ok(draft.body.draft.grossProfitRate >= 0);

    const patch = await request(app)
      .patch(`/api/business/estimate-draft/${draft.body.draft.id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "finalized" });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.draft.status, "finalized");
  });

  it("GET/POST deployment checklist RC2", async () => {
    const list = await request(app)
      .get(`/api/deployment/checklist/${businessProjectId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.totalCount, 11);
    assert.equal(list.body.completedCount, 0);

    const itemId = list.body.items[0].itemId;
    const done = await request(app)
      .post(`/api/deployment/checklist/${businessProjectId}/item/${itemId}/complete`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "RC2 test" });
    assert.equal(done.status, 201);
    assert.equal(done.body.item.completed, true);
    assert.equal(done.body.checklist.completedCount, 1);
  });

  it("PRO Remote floor-stack RC2 + focus", async () => {
    const viewer = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.viewer",
        password: "demo-remote-2026",
      });
    assert.equal(viewer.status, 200);
    const viewerToken = viewer.body.token;

    const stack = await request(app)
      .get("/api/customer/TOMS001/pro-remote/floor-stack?rc=2")
      .set("Authorization", `Bearer ${viewerToken}`);
    assert.equal(stack.status, 200);
    assert.equal(stack.body.phase, "1161-1200");
    assert.deepEqual(stack.body.tiers, ["perimeter", "1f", "2f"]);
    assert.ok(stack.body.layers.length >= 1);

    const focus = await request(app)
      .post("/api/customer/TOMS001/pro-remote/focus")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ floor: "1f", cameraId: "CAM-RC2-01", trigger: "test" });
    assert.equal(focus.status, 201);
    assert.equal(focus.body.ok, true);
    assert.equal(focus.body.floor, "1f");
  });

  it("TV focus camera RC2 + state", async () => {
    const tv = await request(app).post("/api/tv/focus-camera").send({
      customerCode: "TOMS001",
      cameraId: "CAM-RC2-TV",
      floor: "2f",
      trigger: "sensor",
      durationSec: 10,
    });
    assert.equal(tv.status, 201);
    assert.equal(tv.body.event, "focusCamera");
    assert.equal(tv.body.floor, "2f");

    const state = await request(app).get("/api/tv/TOMS001/state");
    assert.equal(state.status, 200);
    assert.equal(state.body.phase, "1161-1200");
    assert.equal(state.body.focusCamera.active, true);
    assert.equal(state.body.focusCamera.cameraId, "CAM-RC2-TV");
    assert.ok(state.body.focusCamera.remainingSec >= 1);
  });

  it("GET /api/customer/:code/handover", async () => {
    const owner = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.owner",
        password: "demo-remote-2026",
      });
    assert.equal(owner.status, 200);

    const res = await request(app)
      .get("/api/customer/TOMS001/handover")
      .set("Authorization", `Bearer ${owner.body.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "1161-1200");
    assert.ok(res.body.handover.loginUrl.includes("/customer/TOMS001"));
    assert.ok(res.body.handover.tvUrl.includes("/tv/TOMS001"));
    assert.ok(res.body.handover.emergencyContact.phone);
  });
});
