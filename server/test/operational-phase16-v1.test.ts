import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-operational-phase16-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase16-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("実案件完走 Phase16", () => {
  let token = "";
  let projectId = "";
  let surveyProjectId = "";

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
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("Phase16-1: 現調保存でステータス自動更新（現調中）", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "守谷テスト様",
        siteName: "守谷市実案件テスト",
        address: "茨城県守谷市中央1-1",
        surveyDate: "2026-06-23",
      });
    assert.equal(survey.status, 201);
    surveyProjectId = survey.body.projectId;

    const linked = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "守谷市実案件テスト",
        customerName: "守谷テスト様",
        municipality: "守谷市",
        assignee: "山中",
        cityCode: "MO",
        surveyProjectId,
      });
    assert.equal(linked.status, 201);
    projectId = linked.body.project.id;

    await request(app)
      .patch(`/api/survey/v1/projects/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "現調メモ保存テスト" });

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.operational.statusLabel, "現調中");
    assert.ok(detail.body.checklist);
    assert.equal(detail.body.checklist.items.find((i) => i.key === "survey")?.done, true);
  });

  it("Phase16-2: 不足一覧が案件詳細に含まれる", async () => {
    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    const keys = detail.body.checklist.items.map((i) => i.key);
    assert.deepEqual(keys, ["survey", "drawing", "estimate", "invoice", "completion"]);
    assert.equal(detail.body.checklist.doneCount, 1);
    assert.equal(detail.body.checklist.allDone, false);
  });

  it("Phase16-1/3: 見積作成で見積提出・粗利表示", async () => {
    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "守谷図面", width: 800, height: 600 });

    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const fromSurvey = await request(app)
      .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok(fromSurvey.status === 200 || fromSurvey.status === 201, JSON.stringify(fromSurvey.body));

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.operational.statusLabel, "見積提出");
    assert.ok(detail.body.checklist.items.find((i) => i.key === "drawing")?.done);
    assert.ok(detail.body.checklist.items.find((i) => i.key === "estimate")?.done);
    assert.ok(detail.body.profit);
    assert.ok(typeof detail.body.profit.estimateAmount === "number");
    assert.ok(typeof detail.body.profit.grossProfit === "number");
    assert.equal(detail.body.profit.isProvisional, true);
  });

  it("Phase16-4: PDFセンター一覧", async () => {
    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(detail.body.pdfCenter);
    assert.equal(detail.body.pdfCenter.total, 4);
    const kinds = detail.body.pdfCenter.items.map((i) => i.kind);
    assert.deepEqual(kinds, ["estimate", "invoice", "specification", "completion"]);
    for (const item of detail.body.pdfCenter.items) {
      assert.ok(item.viewerUrl.includes("document-viewer-v1"));
    }
  });

  it("Phase16-1: 請求作成で請求済", async () => {
    const inv = await request(app)
      .post(`/api/estimate/v1/projects/${projectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(inv.status, 201, JSON.stringify(inv.body));

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.operational.statusLabel, "請求済");
    assert.ok(detail.body.checklist.items.find((i) => i.key === "invoice")?.done);
    assert.ok(detail.body.profit.invoiceAmount != null);
    assert.equal(detail.body.profit.isProvisional, false);
  });

  it("Phase16-1/5: 完了報告で完了ステータス", async () => {
    const report = await request(app)
      .post(`/api/estimate/v1/projects/${projectId}/completion-report/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok(report.status === 200 || report.status === 201, JSON.stringify(report.body));

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.operational.statusLabel, "完了");
    assert.ok(detail.body.checklist.items.find((i) => i.key === "completion")?.done);
  });

  it("案件一覧に operational ステータスが反映", async () => {
    const list = await request(app)
      .get("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    const row = list.body.projects.find((p) => p.id === projectId);
    assert.ok(row);
    assert.equal(row.mgmtStatusLabel, "請求済");
  });

  it("PWA: 案件詳細に Phase16 UI", async () => {
    const html = await request(app).get("/project-mgmt-detail-v1");
    assert.equal(html.status, 200);
    assert.match(html.text, /pdf-center-section|profit-section|op-checklist/);
    const js = await request(app).get("/js/project-mgmt-detail-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /不足一覧/);
    assert.match(js.text, /PDFセンター/);
    assert.match(js.text, /案件利益/);
  });
});
