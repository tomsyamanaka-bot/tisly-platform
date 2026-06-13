import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-work-completion-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-work-completion-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Arrival + Work Completion System v1", () => {
  let token = "";
  let surveyProjectId = "";
  let businessProjectId = "";
  const workDate = "2026-06-11";

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

    const created = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "作業完了テスト",
        siteName: "守谷市カメラ現場",
        address: "茨城県守谷市",
        workTypes: ["camera", "lan"],
      });
    assert.equal(created.status, 201);
    surveyProjectId = created.body.projectId;

    const tplRes = await request(app)
      .get("/api/materials/v1/work-templates")
      .set("Authorization", `Bearer ${token}`);
    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/work-templates`)
      .set("Authorization", `Bearer ${token}`)
      .send({ templateIds: [tplRes.body.templates[0].id] });

    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok([200, 201].includes(est.status));
    businessProjectId = est.body.businessProjectId;
  });

  after(() => closeDatabase());

  it("到着→開始→完了の順序で記録できる", async () => {
    const arrival = await request(app)
      .post("/api/work-session/v1/arrival")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectSource: "business",
        projectId: businessProjectId,
        workDate,
        lat: 35.95,
        lng: 139.99,
      });
    assert.equal(arrival.status, 200);
    assert.ok(arrival.body.session.arrivalTime);
    assert.equal(arrival.body.session.arrivalLat, 35.95);

    const start = await request(app)
      .post("/api/work-session/v1/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId, workDate });
    assert.equal(start.status, 200);
    assert.ok(start.body.session.startTime);

    const checklist = await request(app)
      .get(
        `/api/work-session/v1/completion-checklist?source=business&projectId=${businessProjectId}`
      )
      .set("Authorization", `Bearer ${token}`);
    for (const item of checklist.body.items) {
      await request(app)
        .patch(`/api/work-session/v1/completion-checklist/${item.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ checked: true });
    }

    const complete = await request(app)
      .post("/api/work-session/v1/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId, workDate });
    assert.equal(complete.status, 200);
    assert.ok(complete.body.session.completionTime);
  });

  it("到着時に完了チェックリストが自動生成される", async () => {
    const res = await request(app)
      .get(
        `/api/work-session/v1/completion-checklist?source=business&projectId=${businessProjectId}`
      )
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length >= 4);
    const camera = res.body.items.find((i: { category: string }) => i.category === "防犯カメラ");
    assert.ok(camera);
  });

  it("完了チェックを更新できる", async () => {
    const list = await request(app)
      .get(
        `/api/work-session/v1/completion-checklist?source=business&projectId=${businessProjectId}`
      )
      .set("Authorization", `Bearer ${token}`);
    const first = list.body.items[0];
    const patched = await request(app)
      .patch(`/api/work-session/v1/completion-checklist/${first.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checked: true });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.checked, true);
  });

  it("完了報告書 PDF に作業情報が含まれる", async () => {
    const pdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/completion-report/pdf?live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);
    assert.ok(pdf.text.includes("完了報告書"));
    assert.ok(pdf.text.includes("開始時間") || pdf.text.includes("作業内容"));
  });

  it("完了報告書作成 API が動作する", async () => {
    const created = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/completion-report/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    if (created.status !== 201) assert.fail(created.body?.error || JSON.stringify(created.body));
    assert.ok(created.body.reportId);
  });

  it("案件パイプラインが9段（施工中・完了含む）", async () => {
    const detail = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}?source=business`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    const p = detail.body.project.pipeline;
    assert.ok("construction" in p);
    assert.ok("work_done" in p);
    assert.ok(detail.body.workSession?.completionTime);
  });

  it("ダッシュボードに施工中・完了件数カードがある", async () => {
    const dash = await request(app)
      .get("/api/projects/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(dash.status, 200);
    const ids = dash.body.cards.map((c: { id: string }) => c.id);
    assert.ok(ids.includes("today_construction"));
    assert.ok(ids.includes("today_completed"));
    assert.ok(ids.includes("month_completed"));
  });

  it("日程詳細に workSessions が含まれる", async () => {
    const db = getDatabase();
    db.prepare(
      `UPDATE business_projects SET construction_schedule_json = ? WHERE id = ?`
    ).run(JSON.stringify({ date: workDate, startTime: "09:00" }), businessProjectId);

    const day = await request(app)
      .get(`/api/schedule/v1/day?date=${workDate}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(day.status, 200);
    assert.ok(Array.isArray(day.body.workSessions));
    assert.ok(day.body.siteStops?.length >= 1);
  });
});
