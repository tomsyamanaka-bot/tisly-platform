import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-mgmt-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-mgmt-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  allocateProjectNoV1,
  detectCityCodeFromText,
  listProjectCityCodesV1,
} = await import("../src/projects/project-id-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("案件管理基盤 v1", () => {
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

  it("市コードマスターがシードされる", () => {
    const cities = listProjectCityCodesV1();
    assert.equal(cities.length, 4);
    assert.ok(cities.some((c) => c.cityCode === "MO" && c.cityName === "守谷市"));
    assert.ok(cities.some((c) => c.cityCode === "TM" && c.cityName === "つくばみらい市"));
  });

  it("住所から市コードを判定", () => {
    assert.equal(detectCityCodeFromText("茨城県守谷市中央1-1"), "MO");
    assert.equal(detectCityCodeFromText("つくばみらい市板橋"), "TM");
    assert.equal(detectCityCodeFromText("つくば市研究学園"), "TS");
    assert.equal(detectCityCodeFromText("常総市水海道"), "JY");
  });

  it("案件ID採番 MO-YY-MMDD-連番", () => {
    const no1 = allocateProjectNoV1("MO", new Date("2026-06-16T10:00:00Z"));
    const no2 = allocateProjectNoV1("MO", new Date("2026-06-16T11:00:00Z"));
    assert.match(no1, /^MO-26-0616-\d{3}$/);
    assert.match(no2, /^MO-26-0616-\d{3}$/);
    assert.notEqual(no1, no2);
  });

  it("GET /project-mgmt-v1 ページ", async () => {
    const res = await request(app).get("/project-mgmt-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("案件管理"));
    assert.ok(res.text.includes("新規案件"));
  });

  it("GET /project-mgmt-detail-v1 ページ", async () => {
    const res = await request(app).get("/project-mgmt-detail-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("案件詳細"));
  });

  it("POST/GET 案件 CRUD", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "防犯カメラ設置",
        customerName: "書類UIテスト様",
        municipality: "守谷市",
        address: "茨城県守谷市テスト1-1",
        phone: "0297-00-0000",
        assignee: "山中",
        cityCode: "MO",
      });
    assert.equal(created.status, 201, created.body?.error);
    assert.match(created.body.project.projectNo, /^MO-26-/);
    const id = created.body.project.id;

    const list = await request(app)
      .get("/api/project-mgmt/v1/projects?q=書類UI")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.projects.some((p: { id: string }) => p.id === id));

    const filtered = await request(app)
      .get("/api/project-mgmt/v1/projects?status=inquiry")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(filtered.body.projects.some((p: { id: string }) => p.id === id));

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.project.customerName, "書類UIテスト様");
    assert.ok(detail.body.project.qnapFolderPath.includes("/案件/"));
    assert.equal(detail.body.project.qnapSyncStatus, "pending");

    const patched = await request(app)
      .patch(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mgmtStatus: "survey_scheduled", assignee: "山田" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.detail.project.mgmtStatus, "survey_scheduled");

    const deleted = await request(app)
      .delete(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(deleted.status, 200);

    const gone = await request(app)
      .get(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(gone.status, 404);
  });

  it("下部ナビに案件 → /project-dashboard-v1", async () => {
    const res = await request(app).get("/js/tisly-practical-nav.js");
    assert.ok(res.text.includes('label: "案件"'));
    assert.ok(res.text.includes('href: "/project-dashboard-v1"'));
  });

  it("GET /kpi と workflowCards・timeline・shareHistory", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "v2ダッシュボード検証",
        customerName: "v2KPIテスト様",
        municipality: "守谷市",
        cityCode: "MO",
        assignee: "テスト担当",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;

    const kpiRes = await request(app)
      .get("/api/project-mgmt/v1/kpi")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(kpiRes.status, 200);
    assert.ok(typeof kpiRes.body.kpi.projectsThisMonth === "number");
    assert.ok("orderRatePercent" in kpiRes.body.kpi);

    const detail = await request(app)
      .get(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.body.workflowCards));
    assert.equal(detail.body.workflowCards.length, 5);
    assert.ok(detail.body.workflowCards.some((c: { key: string }) => c.key === "survey"));
    assert.ok(Array.isArray(detail.body.nextActions));
    assert.ok(detail.body.nextActions.some((a: { label: string }) => a.label.includes("見積")));
    assert.ok(detail.body.documentsStatus?.documents?.length === 4);
    assert.ok(Array.isArray(detail.body.timeline));
    assert.ok(detail.body.timeline.some((e: { title: string }) => e.title.includes("案件")));
    assert.ok(Array.isArray(detail.body.shareHistory));

    await request(app)
      .post(`/api/estimate/v1/projects/${id}/pdf-share-log`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentKind: "estimate", fileName: "見積書_test.pdf" });

    const detail2 = await request(app)
      .get(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(detail2.body.shareHistory.length >= 1);
    assert.equal(detail2.body.shareHistory[0].channelLabel, "LINE共有");

    const search = await request(app)
      .get(
        `/api/project-mgmt/v1/projects?customerName=v2KPI&projectNo=${encodeURIComponent(created.body.project.projectNo)}&municipality=守谷&assignee=テスト&status=inquiry`
      )
      .set("Authorization", `Bearer ${token}`);
    assert.equal(search.status, 200);
    assert.ok(search.body.projects.some((p: { id: string }) => p.id === id));
    assert.ok(search.body.kpi);

    await request(app)
      .delete(`/api/project-mgmt/v1/projects/${id}`)
      .set("Authorization", `Bearer ${token}`);
  });

  it("project_timeline ビューが存在", async () => {
    const { getDatabase } = await import("../src/db/database.js");
    const row = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'view' AND name = 'project_timeline'`
      )
      .get() as { name: string } | undefined;
    assert.equal(row?.name, "project_timeline");
  });
});
