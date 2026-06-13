import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-field-checklist-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-field-checklist-v1.db";
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

describe("Field Checklist v1", () => {
  let token = "";
  let businessProjectId = "";
  const workDate = "2026-06-13";

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
        customerName: "チェックリストテスト",
        siteName: "防犯カメラ現場",
        address: "茨城県",
        workTypes: ["camera"],
      });
    assert.equal(created.status, 201);
    const surveyId = created.body.projectId;

    await request(app)
      .post(`/api/survey/v1/projects/${surveyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const fromSurvey = await request(app)
      .post(`/api/estimate/v1/from-survey/${surveyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok([200, 201].includes(fromSurvey.status), fromSurvey.body?.error);
    businessProjectId = fromSurvey.body.businessProjectId;
  });

  after(() => {
    closeDatabase();
  });

  it("シードテンプレートが6種類ある", async () => {
    const res = await request(app)
      .get("/api/field-checklist/v1/templates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.templates.length >= 6);
    const names = res.body.templates.map((t: { name: string }) => t.name);
    assert.ok(names.includes("防犯カメラ"));
    assert.ok(names.includes("LAN配線"));
    assert.ok(names.includes("Wi-Fi"));
    assert.ok(names.includes("インターホン"));
    assert.ok(names.includes("電気工事"));
    assert.ok(names.includes("TiSLY"));
  });

  it("到着でチェックリストがテンプレートから自動生成される", async () => {
    const arrival = await request(app)
      .post("/api/work-session/v1/arrival")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId, workDate });
    assert.equal(arrival.status, 200);
    assert.ok(arrival.body.checklist.length >= 4);
    assert.ok(arrival.body.checklist.some((it: { label: string }) => it.label.includes("電源")));
  });

  it("チェック更新と写真添付ができる", async () => {
    const list = await request(app)
      .get(`/api/work-session/v1/completion-checklist?source=business&projectId=${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const first = list.body.items[0];
    const patched = await request(app)
      .patch(`/api/work-session/v1/completion-checklist/${first.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checked: true });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.checked, true);

    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const photo = await request(app)
      .post(`/api/work-session/v1/completion-checklist/${first.id}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageBase64: tinyPng, fileName: "test.png" });
    assert.equal(photo.status, 200);
    assert.ok(photo.body.photoId);
  });

  it("未完了チェックがあると作業完了が拒否される", async () => {
    await request(app)
      .post("/api/work-session/v1/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId, workDate });

    const blocked = await request(app)
      .post("/api/work-session/v1/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId, workDate });
    assert.equal(blocked.status, 400);
    assert.match(String(blocked.body.error), /未完了/);
  });

  it("force で作業完了できる（理由メモ必須）", async () => {
    const noReason = await request(app)
      .post("/api/work-session/v1/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId, workDate, force: true });
    assert.equal(noReason.status, 400);
    assert.match(String(noReason.body.error), /理由/);

    const done = await request(app)
      .post("/api/work-session/v1/complete")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectSource: "business",
        projectId: businessProjectId,
        workDate,
        force: true,
        forceReason: "お客様都合で後日確認予定",
      });
    assert.equal(done.status, 200);
    assert.ok(done.body.session.completionTime);
    assert.equal(done.body.session.forceCompleteReason, "お客様都合で後日確認予定");
  });

  it("チェック項目メモを保存できる", async () => {
    const list = await request(app)
      .get(`/api/work-session/v1/completion-checklist?source=business&projectId=${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const item = list.body.items[0];
    const patched = await request(app)
      .patch(`/api/work-session/v1/completion-checklist/${item.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ memo: "配線交換済み" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.memo, "配線交換済み");
  });

  it("完了報告書 PDF にチェック結果を出さない", async () => {
    const pdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/completion-report/pdf?live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);
    assert.ok(!pdf.text.includes("確認結果"));
    assert.ok(!pdf.text.includes("確認済"));
    assert.ok(!pdf.text.includes("未確認"));
  });

  it("checklistStatus に forced 件数が含まれる", async () => {
    const status = await request(app)
      .get(
        `/api/work-session/v1/completion-checklist/status?source=business&projectId=${businessProjectId}`
      )
      .set("Authorization", `Bearer ${token}`);
    assert.equal(status.status, 200);
    assert.ok(status.body.forced >= 1);
    assert.ok(status.body.forceCompleteReason);
  });

  it("テンプレート同期で新項目を案件に追加できる", async () => {
    const adminLogin = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.admin", password: "demo-remote-2026" });
    const adminToken = adminLogin.body.token;

    const tplRes = await request(app)
      .get("/api/field-checklist/v1/templates")
      .set("Authorization", `Bearer ${adminToken}`);
    const cameraTpl = tplRes.body.templates.find((t: { name: string }) => t.name === "防犯カメラ");
    assert.ok(cameraTpl);

    await request(app)
      .patch(`/api/field-checklist/v1/templates/${cameraTpl.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        items: [...cameraTpl.items, { label: "同期テスト項目", photoRequired: false }],
      });

    const before = await request(app)
      .get(`/api/work-session/v1/completion-checklist?source=business&projectId=${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const beforeCount = before.body.items.length;

    const synced = await request(app)
      .post("/api/work-session/v1/completion-checklist/sync-templates")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "business", projectId: businessProjectId });
    assert.equal(synced.status, 200);
    assert.ok(synced.body.added >= 1);
    assert.ok(synced.body.items.length >= beforeCount + 1);
    assert.ok(synced.body.items.some((it: { label: string }) => it.label === "同期テスト項目"));
  });

  it("テンプレート CRUD（管理者）", async () => {
    const adminLogin = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.admin", password: "demo-remote-2026" });
    const adminToken = adminLogin.body.token;

    const created = await request(app)
      .post("/api/field-checklist/v1/templates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "テスト用",
        items: [{ label: "動作確認", photoRequired: true }],
      });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const dup = await request(app)
      .post(`/api/field-checklist/v1/templates/${id}/duplicate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    assert.equal(dup.status, 201);

    const stats = await request(app)
      .get("/api/field-checklist/v1/stats/monthly?month=2026-06")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(stats.status, 200);
    assert.ok("confirmationRate" in stats.body);

    await request(app)
      .delete(`/api/field-checklist/v1/templates/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });
});
