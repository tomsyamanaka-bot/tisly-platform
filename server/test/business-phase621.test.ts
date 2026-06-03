import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-621";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-621.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { TOMS_WORKFLOW_STATES } = await import("../src/toms/toms-types.js");

const app = createApp();

describe("Phase 621-660 TOMS unified workflow", () => {
  let token = "";
  let projectId = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
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
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: "BCU-SEED-TOMS",
        customerName: "山田様",
        title: "Phase621 統合試験",
        address: "東京都",
        phone: "090-0000-0000",
      });
    assert.equal(create.status, 201);
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("migration creates timeline and workflow tables", () => {
    const tables = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
          'business_project_timeline','toms_workflow_history','toms_customer_master',
          'toms_assets','business_construction_photos','business_drawing_versions','toms_ai_estimate_v3'
        )`
      )
      .all() as Array<{ name: string }>;
    assert.equal(tables.length, 7);
  });

  it("GET project dashboard", async () => {
    const res = await request(app)
      .get(`/api/toms/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.project.id, projectId);
    assert.ok(res.body.timeline.length >= 1);
  });

  it("TOMS workflow transition draft -> survey", async () => {
    const res = await request(app)
      .post(`/api/toms/projects/${projectId}/workflow/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ to: "survey" });
    assert.equal(res.status, 200);
    assert.equal(res.body.state, "survey");
    const hist = await request(app)
      .get(`/api/toms/projects/${projectId}/workflow`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(hist.body.history.length >= 1);
  });

  it("unified search finds project", async () => {
    const res = await request(app)
      .get("/api/toms/search?q=Phase621")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.hits.some((h: { id: string }) => h.id === projectId));
  });

  it("customer master lists entries", async () => {
    const res = await request(app)
      .get("/api/toms/customer-master")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.customers));
  });

  it("creates asset and QR resolve", async () => {
    const create = await request(app)
      .post("/api/toms/assets")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId, assetType: "esp", label: "ESP-1" });
    assert.equal(create.status, 201);
    const tokenQr = create.body.asset.qrToken;
    const page = await request(app)
      .get(`/api/toms/assets/qr/${tokenQr}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(page.status, 200);
    assert.equal(page.body.asset.id, create.body.asset.id);
  });

  it("AI estimate v3 generates candidate", async () => {
    const res = await request(app)
      .post(`/api/toms/projects/${projectId}/ai-estimate-v3`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 201);
    assert.ok(res.body.espCount >= 0);
    assert.ok(res.body.candidate);
  });

  it("drawing version CRUD", async () => {
    const res = await request(app)
      .post(`/api/toms/projects/${projectId}/drawing-versions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ versionKind: "survey", title: "現調図v1" });
    assert.equal(res.status, 201);
    const list = await request(app)
      .get(`/api/toms/projects/${projectId}/drawing-versions`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.body.versions.length, 1);
  });

  it("KPI and hub operations", async () => {
    const kpi = await request(app)
      .get("/api/toms/kpi")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(kpi.status, 200);
    assert.ok(typeof kpi.body.projectCount === "number");

    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(hub.status, 200);
    assert.ok(hub.body.operations);
  });

  it("workflow states catalog", () => {
    assert.ok(TOMS_WORKFLOW_STATES.includes("maintenance"));
  });

  it("serves project dashboard HTML route", async () => {
    const res = await request(app).get(`/project/${projectId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /案件ダッシュボード/);
  });
});
