import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-701";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-701.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 701-740 live operations", () => {
  let token = "";
  let projectId = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    assert.equal(login.status, 200);
    token = login.body.token;

    const create = await request(app)
      .post("/api/business/projects")
      .set("Authorization", "Bearer " + token)
      .send({
        customerId: "BCU-SEED-TOMS",
        customerName: "山田様",
        title: "Phase701 Live Ops試験",
        address: "東京都",
        phone: "090-0000-0000",
      });
    assert.equal(create.status, 201);
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("migration phase701 tables exist", () => {
    const tables = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
          'business_integration_retry_queue','ai_estimate_feedback'
        )`
      )
      .all() as Array<{ name: string }>;
    assert.equal(tables.length, 2);
  });

  it("GET live ws-status", async () => {
    const res = await request(app)
      .get("/api/toms/live/ws-status")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.equal(res.body.path, "/ws");
    assert.ok(typeof res.body.clients === "number");
  });

  it("retry queue enqueue retry cancel log", async () => {
    const enq = await request(app)
      .post("/api/business/retry-queue/enqueue-mock")
      .set("Authorization", "Bearer " + token)
      .send({ projectId, channel: "gmail", sendMode: "mockOnly" });
    assert.equal(enq.status, 201);
    const itemId = enq.body.item.id;

    const list = await request(app)
      .get(`/api/toms/projects/${projectId}/retry-queue`)
      .set("Authorization", "Bearer " + token);
    assert.ok(list.body.items.some((i: { id: string }) => i.id === itemId));

    const retry = await request(app)
      .post(`/api/toms/projects/${projectId}/retry-queue/${itemId}/retry`)
      .set("Authorization", "Bearer " + token);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.item.status, "success");

    const tl = await request(app)
      .get(`/api/toms/projects/${projectId}/timeline`)
      .set("Authorization", "Bearer " + token);
    assert.ok(tl.body.entries.some((e: { title: string }) => /gmail/i.test(e.title)));

    const enq2 = await request(app)
      .post("/api/business/retry-queue/enqueue-mock")
      .set("Authorization", "Bearer " + token)
      .send({ projectId, channel: "qnap" });
    const cancel = await request(app)
      .post(`/api/toms/projects/${projectId}/retry-queue/${enq2.body.item.id}/cancel`)
      .set("Authorization", "Bearer " + token);
    assert.equal(cancel.body.item.status, "cancelled");

    const log = await request(app)
      .get(`/api/toms/projects/${projectId}/retry-queue/${itemId}/log`)
      .set("Authorization", "Bearer " + token);
    assert.ok(Array.isArray(log.body.item.log));
  });

  it("integration error auto-enqueues retry", async () => {
    const { logBusinessIntegration } = await import(
      "../src/business/business-integration-log.js"
    );
    logBusinessIntegration({
      projectId,
      type: "qnap",
      provider: "test",
      status: "error",
      request: { dryRun: true, mockOnly: true },
      errorMessage: "save failed",
    });
    const list = await request(app)
      .get(`/api/toms/projects/${projectId}/retry-queue`)
      .set("Authorization", "Bearer " + token);
    assert.ok(list.body.items.length >= 1);
  });

  it("drawing diff v2 items", async () => {
    await request(app)
      .post(`/api/toms/projects/${projectId}/drawing-versions`)
      .set("Authorization", "Bearer " + token)
      .send({
        versionKind: "survey",
        title: "現調",
        devices: [{ id: "d1", label: "Cam1", assetType: "camera", posX: 0.1, posY: 0.2 }],
      });
    await request(app)
      .post(`/api/toms/projects/${projectId}/drawing-versions`)
      .set("Authorization", "Bearer " + token)
      .send({
        versionKind: "as_built",
        title: "完成",
        devices: [{ id: "d2", label: "ESP2", assetType: "esp", posX: 0.5, posY: 0.5 }],
      });
    const diff = await request(app)
      .get(`/api/toms/projects/${projectId}/drawing-diff`)
      .set("Authorization", "Bearer " + token);
    assert.ok(Array.isArray(diff.body.items));
    assert.ok(diff.body.items.some((i: { changeType: string }) => i.changeType === "added"));
  });

  it("ai estimate feedback", async () => {
    await request(app)
      .post(`/api/toms/projects/${projectId}/ai-estimate-v3`)
      .set("Authorization", "Bearer " + token);
    const fb = await request(app)
      .post(`/api/toms/projects/${projectId}/ai-estimate-v3/feedback`)
      .set("Authorization", "Bearer " + token)
      .send({ action: "adopted", notes: "テスト採用" });
    assert.equal(fb.status, 201);
    assert.equal(fb.body.feedback.action, "adopted");
    const list = await request(app)
      .get(`/api/toms/projects/${projectId}/ai-estimate-v3/feedback`)
      .set("Authorization", "Bearer " + token);
    assert.equal(list.body.feedback.length, 1);
    const row = getDatabase()
      .prepare(`SELECT * FROM ai_estimate_feedback WHERE project_id = ?`)
      .get(projectId);
    assert.ok(row);
  });

  it("KPI multi-tenant fields", async () => {
    const res = await request(app)
      .get("/api/toms/kpi")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.byCustomer));
    assert.ok(Array.isArray(res.body.bySite));
    assert.ok(typeof res.body.anomalyCount === "number");
    assert.ok(typeof res.body.maintenanceCases === "number");
  });

  it("hub operations maintenance due fields", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.operations.maintenanceDueSoon === "number");
    assert.ok(typeof res.body.operations.retryQueuePending === "number");
  });

  it("unified PDF specification render", async () => {
    const { getBusinessProject } = await import("../src/business/business-store.js");
    const { renderSpecificationPdf } = await import("../src/business/pdf/render.js");
    const project = getBusinessProject(projectId)!;
    const rendered = await renderSpecificationPdf(project, "SPEC-TEST", "試験仕様書");
    assert.ok(rendered.htmlPath.includes("specification"));
    assert.ok(rendered.pdfPath);
  });

  it("serves dashboard with ws status and retry section", async () => {
    const dash = await request(app).get(`/project/${projectId}`);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /dash-ws-status/);
    assert.match(dash.text, /dash-retry-queue/);
  });
});
