import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-survey-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("現調PWA v1 API", () => {
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
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("現調案件を作成できる", async () => {
    const res = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "テスト顧客",
        address: "東京都千代田区",
        phone: "03-0000-0000",
        email: "test@example.com",
        surveyDate: "2026-06-08",
        assignee: "担当A",
        notes: "初期メモ",
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.projectId);
    assert.ok(res.body.projectNo?.startsWith("G"));
    assert.equal(res.body.workflowStatus, "surveying");
    assert.equal(res.body.customerName, "テスト顧客");
    projectId = res.body.projectId;
  });

  it("一覧取得できる", async () => {
    const res = await request(app)
      .get("/api/survey/v1/projects?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.projects.some((p: { projectId: string }) => p.projectId === projectId));
  });

  it("詳細取得できる（メモ含む）", async () => {
    const res = await request(app)
      .get(`/api/survey/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.notes, "初期メモ");
    assert.ok(Array.isArray(res.body.photos));
    assert.ok(Array.isArray(res.body.materials));
  });

  it("ステータス更新できる", async () => {
    const res = await request(app)
      .patch(`/api/survey/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assignee: "担当B", workflowStatus: "surveying" });
    assert.equal(res.status, 200);
    assert.equal(res.body.assignee, "担当B");
  });

  it("写真メモを追加できる", async () => {
    const textMemo = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ comment: "配線位置メモ", takenAt: "2026-06-08T10:00:00.000Z" });
    assert.equal(textMemo.status, 201);
    assert.equal(textMemo.body.comment, "配線位置メモ");

    const withImage = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        comment: "現場写真",
        imageBase64: TINY_PNG,
        fileName: "field.jpg",
      });
    assert.equal(withImage.status, 201);
    assert.ok(withImage.body.url.includes("/uploads/survey/"));

    const detail = await request(app)
      .get(`/api/survey/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.photos.length, 2);
  });

  it("部材を追加できる", async () => {
    const res = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/materials`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "camera", itemLabel: "屋外カメラ", quantity: 2, memo: "玄関" });
    assert.equal(res.status, 201);
    assert.equal(res.body.category, "camera");
    assert.equal(res.body.quantity, 2);

    const detail = await request(app)
      .get(`/api/survey/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.materials.length, 1);
  });

  it("estimate_pending に変更し handoff log を作成できる", async () => {
    const res = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.project.workflowStatus, "estimate_pending");
    assert.ok(res.body.handoff.id);
    assert.equal(res.body.handoff.surveyProjectId, projectId);
    assert.equal(res.body.handoff.businessProjectId, "");

    const row = getDatabase()
      .prepare(`SELECT * FROM survey_handoff_log WHERE survey_project_id = ?`)
      .get(projectId) as { payload_json: string } | undefined;
    assert.ok(row);
    const payload = JSON.parse(row!.payload_json) as { materialCount: number; photoCount: number };
    assert.equal(payload.materialCount, 1);
    assert.equal(payload.photoCount, 2);

    const detail = await request(app)
      .get(`/api/survey/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.workflowStatus, "estimate_pending");
    assert.ok(detail.body.handoff);
  });

  it("既存 /api/survey は影響を受けない", async () => {
    const res = await request(app)
      .post("/api/survey/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerCode: "TOMS001", siteName: "レガシー現場" });
    assert.equal(res.status, 201);
    assert.ok(res.body.projectId);
  });
});
