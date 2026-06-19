import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-automation-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-automation-v1.db";
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

describe("Project Automation Engine v1", () => {
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

  after(() => {
    closeDatabase();
  });

  it("シードテンプレートが15種類ある", async () => {
    const res = await request(app)
      .get("/api/project-automation/v1/templates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.templates.length, 15);
    const names = res.body.templates.map((t: { name: string }) => t.name);
    assert.ok(names.includes("防犯カメラ工事"));
    assert.ok(names.includes("その他"));
  });

  it("防犯カメラテンプレートにやる事・持ち物・写真がある", async () => {
    const list = await request(app)
      .get("/api/project-automation/v1/templates")
      .set("Authorization", `Bearer ${token}`);
    const camera = list.body.templates.find((t: { name: string }) => t.name === "防犯カメラ工事");
    assert.ok(camera);
    const detail = await request(app)
      .get(`/api/project-automation/v1/templates/${camera.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.tasks.length, 10);
    assert.equal(detail.body.tools.length, 10);
    assert.equal(detail.body.photos.length, 6);
  });

  it("案件作成時にテンプレート適用できる", async () => {
    const tplRes = await request(app)
      .get("/api/project-automation/v1/templates")
      .set("Authorization", `Bearer ${token}`);
    const camera = tplRes.body.templates.find((t: { name: string }) => t.name === "防犯カメラ工事");

    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "自動化エンジンテスト現場",
        customerName: "自動化テスト様",
        cityCode: "MO",
        templateId: camera.id,
      });
    assert.equal(created.status, 201, created.body?.error);
    projectId = created.body.project.id;
    assert.ok(created.body.detail.automation);
    assert.equal(created.body.detail.automation.tasks.length, 10);
    assert.equal(created.body.detail.automation.tools.length, 10);
    assert.equal(created.body.detail.automation.photos.length, 6);
  });

  it("やる事・持ち物の進捗を更新できる", async () => {
    const bundle = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(bundle.status, 200);
    const taskId = bundle.body.tasks[0].id;
    const toolId = bundle.body.tools[0].id;

    const taskPatch = await request(app)
      .patch(`/api/project-automation/v1/projects/${projectId}/tasks/${taskId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ done: true });
    assert.equal(taskPatch.status, 200);
    assert.equal(taskPatch.body.done, true);

    const toolPatch = await request(app)
      .patch(`/api/project-automation/v1/projects/${projectId}/tools/${toolId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checked: true });
    assert.equal(toolPatch.status, 200);
    assert.equal(toolPatch.body.checked, true);

    const updated = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(updated.body.progress.tasks.done, 1);
    assert.equal(updated.body.progress.tools.checked, 1);
    assert.ok(updated.body.progress.tasks.percent > 0);
  });

  it("未撮影写真一覧を返す", async () => {
    const res = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/unshot-photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.photos.length, 6);
  });

  it("案件詳細APIにautomationが含まれる", async () => {
    const res = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.automation);
    assert.equal(res.body.automation.templateName, "防犯カメラ工事");
  });

  it("ダッシュボード最近案件に進捗が含まれる", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/recent")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const item = res.body.projects.find((p: { id: string }) => p.id === projectId);
    assert.ok(item);
    assert.ok(item.automation);
    assert.ok(item.automation.tasksTotal >= 10);
    assert.ok(item.automation.tasksDone >= 1);
  });

  it("やる事にメモを保存できる", async () => {
    const bundle = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    const taskId = bundle.body.tasks[0].id;
    const patch = await request(app)
      .patch(`/api/project-automation/v1/projects/${projectId}/tasks/${taskId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ memo: "配線注意" });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.memo, "配線注意");
  });

  it("現場でやる事を追加できる", async () => {
    const res = await request(app)
      .post(`/api/project-automation/v1/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "追加工事確認" });
    assert.equal(res.status, 201);
    assert.equal(res.body.label, "追加工事確認");
  });

  it("AI提案（ルールベース）が返る", async () => {
    const res = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.suggestions));
    assert.ok(res.body.suggestions.length >= 1);
  });

  it("完了報告写真データAPI", async () => {
    const res = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/completion-report-photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.photos.length, 6);
    const first = res.body.photos[0];
    assert.ok("photoSlotName" in first);
    assert.ok("photoOrder" in first);
    assert.ok("hasPhoto" in first);
    assert.ok("missing" in first);
    assert.ok("localPath" in first);
    assert.ok("qnapPath" in first);
    assert.equal(first.hasPhoto, false);
    assert.equal(first.missing, true);
    const orders = res.body.photos.map((p: { photoOrder: number }) => p.photoOrder);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it("GET /project-automation-admin-v1 ページ", async () => {
    const res = await request(app).get("/project-automation-admin-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("案件テンプレート管理"));
  });

  it("管理APIでテンプレート一覧を取得", async () => {
    const res = await request(app)
      .get("/api/project-automation/v1/admin/templates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.templates.length >= 15);
    assert.ok(Array.isArray(res.body.categories));
  });
});
