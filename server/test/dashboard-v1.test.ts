import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-dashboard-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-dashboard-v1.db";
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

describe("案件ダッシュボード v1", () => {
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

  it("GET /project-dashboard-v1 ページ", async () => {
    const res = await request(app).get("/project-dashboard-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("案件ダッシュボード"));
    assert.ok(res.text.includes("今日の予定"));
  });

  it("GET /api/dashboard-v1/summary", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "ダッシュボード検証",
        customerName: "ダッシュボード様",
        municipality: "守谷市",
        phone: "0297-11-2233",
        assignee: "山中",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);

    const res = await request(app)
      .get("/api/dashboard-v1/summary")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.summary.total >= 1);
    assert.ok(Array.isArray(res.body.summary.cards));
    assert.ok(res.body.summary.cards.some((c: { key: string }) => c.key === "total"));
    assert.ok(res.body.summary.cards.some((c: { key: string }) => c.key === "inquiry"));
  });

  it("GET /api/dashboard-v1/summary?q= 検索", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/summary?q=0297-11")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.searchResults));
    assert.ok(res.body.searchResults.length >= 1);
  });

  it("GET /api/dashboard-v1/today", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/today")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(res.body.items));
  });

  it("GET /api/dashboard-v1/alerts", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/alerts")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.alerts));
  });

  it("GET /api/dashboard-v1/recent", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/recent")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
    assert.ok(res.body.projects.length >= 1);
    assert.ok("projectNo" in res.body.projects[0]);
  });

  it("GET /api/dashboard-v1/city-stats", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/city-stats")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.cities));
    assert.equal(res.body.cities.length, 4);
    assert.ok(res.body.cities.some((c: { cityCode: string }) => c.cityCode === "MO"));
  });

  it("GET /api/dashboard-v1/sales", async () => {
    const res = await request(app)
      .get("/api/dashboard-v1/sales")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.sales);
    assert.ok(typeof res.body.sales.estimateTotal === "number");
    assert.ok(typeof res.body.sales.invoiceTotal === "number");
    assert.ok(typeof res.body.sales.paidTotal === "number");
  });

  it("現調予定日超過アラート", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "超過アラート検証",
        customerName: "超過テスト様",
        municipality: "つくば市",
        cityCode: "TS",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;
    getDatabase()
      .prepare(
        `UPDATE business_projects
         SET status = 'survey_scheduled', survey_schedule_json = ?
         WHERE id = ?`
      )
      .run(JSON.stringify({ date: "2020-01-01" }), id);

    const res = await request(app)
      .get("/api/dashboard-v1/alerts")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(
      res.body.alerts.some(
        (a: { projectId: string; alertType: string }) =>
          a.projectId === id && a.alertType === "survey_overdue"
      )
    );
  });

  it("入金待ちアラート", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "入金待ち検証",
        customerName: "入金待ちテスト様",
        municipality: "つくば市",
        cityCode: "TS",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;
    getDatabase()
      .prepare(
        `UPDATE business_projects
         SET status = 'invoiced', invoice_id = 'inv-test-dash'
         WHERE id = ?`
      )
      .run(id);

    const res = await request(app)
      .get("/api/dashboard-v1/alerts")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(
      res.body.alerts.some(
        (a: { projectId: string; alertType: string }) =>
          a.projectId === id && a.alertType === "payment_pending"
      )
    );
  });

  it("下部ナビ案件タブはダッシュボードへ", async () => {
    const res = await request(app).get("/js/tisly-practical-nav.js");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('href: "/project-dashboard-v1"'));
  });

  it("App Hub に案件ダッシュボードカード", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const dash = (res.body.practicalApps ?? []).find(
      (a: { id: string }) => a.id === "project_dashboard_v1"
    );
    assert.ok(dash);
    assert.equal(dash.url, "/project-dashboard-v1");
    assert.equal(dash.status, "ready");
  });

  it("案件詳細リンクに return パラメータ", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "return検証",
        customerName: "returnテスト様",
        municipality: "守谷市",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;

    const today = await request(app)
      .get("/api/dashboard-v1/today")
      .set("Authorization", `Bearer ${token}`);
    for (const item of today.body.items ?? []) {
      if (item.projectId === id && item.detailHref) {
        assert.ok(item.detailHref.includes("return="));
        assert.ok(item.detailHref.includes("project-mgmt-detail-v1"));
      }
    }

    const recent = await request(app)
      .get("/api/dashboard-v1/recent")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(recent.body.projects?.some((p: { id: string }) => p.id === id));
  });

  it("PDF未保存アラート", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "PDF未保存検証",
        customerName: "PDFアラート様",
        municipality: "守谷市",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;

    getDatabase()
      .prepare(`UPDATE business_projects SET estimate_id = 'est-dash-pdf-missing' WHERE id = ?`)
      .run(id);

    const res = await request(app)
      .get("/api/dashboard-v1/alerts")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(
      res.body.alerts.some(
        (a: { projectId: string; alertType: string }) =>
          a.projectId === id && a.alertType === "pdf_not_saved"
      )
    );
  });

  it("写真不足アラート", async () => {
    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "写真不足検証",
        customerName: "写真不足様",
        municipality: "守谷市",
        cityCode: "MO",
      });
    assert.equal(created.status, 201);
    const id = created.body.project.id;

    getDatabase()
      .prepare(`UPDATE business_projects SET survey_project_id = 'svy-mock-no-photos' WHERE id = ?`)
      .run(id);

    const res = await request(app)
      .get("/api/dashboard-v1/alerts")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(
      res.body.alerts.some(
        (a: { projectId: string; alertType: string }) =>
          a.projectId === id && a.alertType === "photos_missing"
      )
    );
  });
});
