import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-status-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-status-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  deriveProjectStatusV1,
  buildProjectStatusSignalsV1,
  PROJECT_STATUS_LABELS_V1,
  PROJECT_STATUS_COLOR_GROUP_V1,
} = await import("../src/projects/project-status-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("案件ステータス自動化 v1", () => {
  let token = "";

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

  it("13段階ステータス定義", () => {
    assert.equal(PROJECT_STATUS_LABELS_V1.inquiry, "問い合わせ");
    assert.equal(PROJECT_STATUS_LABELS_V1.estimate_creating, "見積作成中");
    assert.equal(PROJECT_STATUS_LABELS_V1.estimate_submitted, "見積提出済");
    assert.equal(PROJECT_STATUS_LABELS_V1.awaiting_invoice, "請求待ち");
    assert.equal(PROJECT_STATUS_LABELS_V1.completed, "完了");
    assert.equal(PROJECT_STATUS_COLOR_GROUP_V1.inquiry, "gray");
    assert.equal(PROJECT_STATUS_COLOR_GROUP_V1.construction_in_progress, "orange");
    assert.equal(PROJECT_STATUS_COLOR_GROUP_V1.awaiting_payment, "purple");
    assert.equal(PROJECT_STATUS_COLOR_GROUP_V1.completed, "green");
  });

  it("自動判定ウォーターフォール", () => {
    const base = buildProjectStatusSignalsV1({
      projectId: "BIZ-TEST",
      businessStatus: "new",
    });
    assert.equal(deriveProjectStatusV1(base), "inquiry");

    assert.equal(
      deriveProjectStatusV1({ ...base, isSurveyDone: true, hasEstimate: false }),
      "estimate_creating"
    );
    assert.equal(
      deriveProjectStatusV1({ ...base, isSurveyDone: true, hasEstimate: true }),
      "estimate_submitted"
    );
    assert.equal(
      deriveProjectStatusV1({ ...base, isSurveyDone: true, hasEstimate: true, isOrdered: true }),
      "ordered"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        isOrdered: true,
        hasGoogleCalendarEvent: true,
      }),
      "construction_scheduled"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        isOrdered: true,
        hasActiveWorkSession: true,
      }),
      "construction_in_progress"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        isOrdered: true,
        hasWorkCompleted: true,
      }),
      "completion_report_creating"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        isOrdered: true,
        hasCompletionReportPdf: true,
      }),
      "awaiting_invoice"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        hasInvoice: true,
        businessStatus: "invoice_created",
      }),
      "invoiced"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        hasInvoice: true,
        businessStatus: "invoice_sent",
      }),
      "awaiting_payment"
    );
    assert.equal(
      deriveProjectStatusV1({
        ...base,
        isSurveyDone: true,
        hasEstimate: true,
        hasInvoice: true,
        hasPaidDate: true,
      }),
      "completed"
    );
  });

  it("GET /api/project-status-v1/:projectId", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "ステータスAPI検証",
        customerName: "ステータス様",
        municipality: "守谷市",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;

    const res = await request(app)
      .get(`/api/project-status-v1/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "inquiry");
    assert.equal(res.body.statusLabel, "問い合わせ");
    assert.equal(res.body.statusColor, "gray");
    assert.ok(res.body.updatedAt);

    getDatabase()
      .prepare(
        `UPDATE business_projects SET status = 'survey_done', estimate_id = 'est-status-v1' WHERE id = ?`
      )
      .run(id);

    const res2 = await request(app)
      .get(`/api/project-status-v1/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res2.body.status, "estimate_submitted");
    assert.equal(res2.body.statusLabel, "見積提出済");
    assert.equal(res2.body.statusColor, "yellow");

    await request(app)
      .delete(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
  });

  it("案件詳細に projectStatus を含む", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "詳細ステータス検証",
        customerName: "詳細ステータス様",
        municipality: "守谷市",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.projectStatus);
    assert.equal(detail.body.projectStatus.status, "inquiry");

    await request(app)
      .delete(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
  });

  it("存在しない案件は404", async () => {
    const res = await request(app)
      .get("/api/project-status-v1/BIZ-NOTFOUND")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 404);
  });
});
