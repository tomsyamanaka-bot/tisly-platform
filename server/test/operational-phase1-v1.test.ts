import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-operational-phase1-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase1-v1.db";
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

describe("実運用フェーズ1 Phase10-15", () => {
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

  it("Phase10: 案件詳細に operational ステータスと進捗バー", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "守谷市テスト案件",
        customerName: "守谷テスト様",
        phone: "0297-00-0000",
        address: "茨城県守谷市中央1-1",
        municipality: "守谷市",
        assignee: "山中",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    projectId = created.body.project.id;

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.project.customerName, "守谷テスト様");
    assert.equal(detail.body.project.phone, "0297-00-0000");
    assert.ok(detail.body.operational);
    assert.equal(detail.body.operational.statusLabel, "未着手");
    assert.ok(detail.body.operational.progress);
    assert.equal(detail.body.operational.progress.total, 8);
    assert.ok(detail.body.operational.progress.percent >= 12);
  });

  it("Phase11: 案件作成でタイムラインに記録", async () => {
    const timeline = await request(app)
      .get(`/api/project-timeline-v1/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(timeline.status, 200);
    assert.ok(Array.isArray(timeline.body.events));
    assert.ok(timeline.body.events.some((e) => e.title.includes("案件作成") || e.eventType === "project_created"));
  });

  it("Phase12: ワークフローカードに return 付き href", async () => {
    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    const cards = detail.body.workflowCards;
    const drawing = cards.find((c) => c.key === "drawing");
    assert.ok(drawing, "図面カードあり");
    const estimate = cards.find((c) => c.key === "estimate");
    assert.ok(estimate.href?.includes("return="));
    assert.ok(estimate.href?.includes("projectId="));
  });

  it("Phase13: 案件ダッシュボード operational KPI", async () => {
    const kpi = await request(app)
      .get("/api/dashboard-v1/operational-kpi")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(kpi.status, 200);
    const cards = kpi.body.operational.cards;
    assert.ok(cards.some((c) => c.key === "in_progress"));
    assert.ok(cards.some((c) => c.key === "estimate_waiting"));
    assert.ok(cards.some((c) => c.key === "invoice_waiting"));
    assert.ok(cards.some((c) => c.key === "week_sales"));
    assert.ok(cards.some((c) => c.key === "gross_profit"));
  });

  it("Phase14: 案件系 API が応答する", async () => {
    const mgmt = await request(app)
      .get("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(mgmt.status, 200);
    assert.ok(Array.isArray(mgmt.body.projects));

    const survey = await request(app)
      .get("/api/survey/v1/projects?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(survey.status, 200);
    assert.ok(Array.isArray(survey.body.projects));
  });

  it("Phase15: 守谷市テスト案件 — 現調連携で進捗が進む", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "守谷テスト様",
        siteName: "守谷市テスト案件",
        address: "茨城県守谷市中央1-1",
        surveyDate: "2026-06-23",
      });
    assert.equal(survey.status, 201);
    surveyProjectId = survey.body.projectId;

    const linked = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "守谷市連携案件",
        customerName: "守谷テスト様",
        municipality: "守谷市",
        assignee: "山中",
        cityCode: "MO",
        surveyProjectId,
      });
    assert.equal(linked.status, 201, JSON.stringify(linked.body));

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${linked.body.project.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(detail.body.survey.linked);
    assert.ok(detail.body.operational.progress.doneCount >= 2);
    const surveyCard = detail.body.workflowCards.find((c) => c.key === "survey");
    assert.ok(surveyCard?.href?.includes("return="));
  });

  it("PWA ルート: 案件詳細・ダッシュボード HTML", async () => {
    for (const path of ["/project-mgmt-detail-v1", "/project-dashboard-v1", "/route-health"]) {
      const res = await request(app).get(path);
      assert.equal(res.status, 200, path);
      assert.match(res.text, /html/i);
    }
  });
});
