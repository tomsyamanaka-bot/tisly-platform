import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-661";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-661.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 661-700 command center", () => {
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
        title: "Phase661 司令塔試験",
        address: "東京都",
        phone: "090-0000-0000",
      });
    assert.equal(create.status, 201);
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("migration phase661 tables exist", () => {
    const tables = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
          'toms_project_notifications','toms_project_maintenance'
        )`
      )
      .all() as Array<{ name: string }>;
    assert.equal(tables.length, 2);
  });

  it("GET dashboard v2 payload", async () => {
    const res = await request(app)
      .get(`/api/toms/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.liveDevices));
    assert.ok(res.body.floorStack);
    assert.ok(res.body.drawingDiff);
    assert.ok(res.body.proRemote);
  });

  it("GET devices/live", async () => {
    const res = await request(app)
      .get(`/api/toms/projects/${projectId}/devices/live`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.devices));
  });

  it("notifications list and ack", async () => {
    const list = await request(app)
      .get(`/api/toms/projects/${projectId}/notifications`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    if (list.body.notifications.length > 0) {
      const id = list.body.notifications[0].id;
      const ack = await request(app)
        .post(`/api/toms/projects/${projectId}/notifications/${id}/ack`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(ack.status, 200);
      assert.equal(ack.body.notification.acknowledged, true);
    }
  });

  it("maintenance create and close", async () => {
    const create = await request(app)
      .post(`/api/toms/projects/${projectId}/maintenance/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        scheduledDate: "2026-12-01",
        content: "定期点検",
        targetDevices: ["ESP-1"],
        assignee: "テスト担当",
      });
    assert.equal(create.status, 201);
    const caseId = create.body.case.caseId;
    const close = await request(app)
      .post(`/api/toms/projects/${projectId}/maintenance/${caseId}/close`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(close.status, 200);
    assert.equal(close.body.case.status, "closed");
  });

  it("drawing diff with device placements", async () => {
    await request(app)
      .post(`/api/toms/projects/${projectId}/drawing-versions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        versionKind: "survey",
        title: "現調",
        devices: [{ id: "d1", label: "Cam1", assetType: "camera", posX: 0.1, posY: 0.2 }],
      });
    await request(app)
      .post(`/api/toms/projects/${projectId}/drawing-versions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        versionKind: "as_built",
        title: "完成",
        devices: [
          { id: "d1", label: "Cam1", assetType: "camera", posX: 0.5, posY: 0.5 },
          { id: "d2", label: "ESP2", assetType: "esp" },
        ],
      });
    const diff = await request(app)
      .get(`/api/toms/projects/${projectId}/drawing-diff`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(diff.status, 200);
    assert.ok(diff.body.added.some((d: { id: string }) => d.id === "d2"));
    assert.ok(diff.body.moved.length >= 1);
  });

  it("integration log syncs to timeline", async () => {
    const { logBusinessIntegration } = await import(
      "../src/business/business-integration-log.js"
    );
    logBusinessIntegration({
      projectId,
      type: "gmail",
      provider: "gmail_test",
      status: "success",
      request: { dryRun: true, mockOnly: true },
    });
    const tl = await request(app)
      .get(`/api/toms/projects/${projectId}/timeline`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(tl.body.entries.some((e: { title: string }) => e.title.includes("Gmail")));
  });

  it("KPI includes extended metrics", async () => {
    const res = await request(app)
      .get("/api/toms/kpi")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.avgConstructionDays === "number");
    assert.ok(typeof res.body.estimateApprovalRate === "number");
  });

  it("hub operations extended fields", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.operations, null);
    const { buildHubOperations } = await import(
      "../src/toms/hub-operations.js"
    );
    const ops = buildHubOperations("TOMS001");
    assert.ok(typeof ops.unsentEstimates === "number");
    assert.ok(typeof ops.aiEstimatePending === "number");
  });

  it("serves kpi and dashboard HTML", async () => {
    const kpi = await request(app).get("/business/kpi");
    assert.equal(kpi.status, 200);
    const dash = await request(app).get(`/project/${projectId}`);
    assert.match(dash.text, /Floor Stack/);
  });
});
