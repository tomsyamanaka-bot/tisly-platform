import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-timeline-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-timeline-v1.db";
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

describe("案件タイムライン v1", () => {
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
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;

    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "タイムライン検証",
        customerName: "タイムライン様",
        municipality: "守谷市",
        assignee: "テスト担当",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    projectId = created.body.project.id;
  });

  after(() => closeDatabase());

  it("project_timeline_events テーブルが存在", async () => {
    const { getDatabase } = await import("../src/db/database.js");
    const row = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_timeline_events'`
      )
      .get() as { name: string } | undefined;
    assert.equal(row?.name, "project_timeline_events");
  });

  it("GET /api/project-timeline-v1/:projectId — 案件作成履歴", async () => {
    const res = await request(app)
      .get(`/api/project-timeline-v1/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.events.some((e: { title: string }) => e.title === "案件作成"));
    assert.ok(res.body.count >= 1);
  });

  it("POST /api/project-timeline-v1/add — 内部追加", async () => {
    const res = await request(app)
      .post("/api/project-timeline-v1/add")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        eventType: "pdf_shared",
        title: "LINE共有",
        description: "見積書 · test.pdf",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.event.title, "LINE共有");
  });

  it("検索 q=見積 で絞り込み", async () => {
    await request(app)
      .post("/api/project-timeline-v1/add")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        eventType: "estimate_pdf_saved",
        title: "見積PDF保存",
        description: "見積書_test.pdf",
      });
    const res = await request(app)
      .get(`/api/project-timeline-v1/${projectId}?q=${encodeURIComponent("見積")}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.events.every((e: { title: string; description: string }) =>
      `${e.title} ${e.description}`.includes("見積")
    ));
  });

  it("pdf-share-log で共有履歴が追加される", async () => {
    const log = await request(app)
      .post(`/api/estimate/v1/projects/${projectId}/pdf-share-log`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentKind: "estimate", fileName: "見積書_共有検証.pdf" });
    assert.equal(log.status, 201);

    const tl = await request(app)
      .get(`/api/project-timeline-v1/${projectId}?q=${encodeURIComponent("共有")}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(tl.body.events.some((e: { title: string }) => e.title.includes("共有")));
  });

  it("案件詳細 API の timeline に v1 履歴が含まれる", async () => {
    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.body.timeline));
    assert.ok(detail.body.timeline.some((e: { title: string }) => e.title === "案件作成"));
    assert.ok(detail.body.timeline[0].date.includes("/"));
  });
});
