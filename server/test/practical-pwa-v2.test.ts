import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-practical-v2";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-practical-pwa-v2.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.OPEN_METEO_LIVE = "0";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { classifyEventCategory } = await import("../src/services/googleCalendar.js");
const { replaceCachedCalendarEvents } = await import("../src/schedule/schedule-calendar-store.js");
const { mockCalendarEvents } = await import("../src/services/googleCalendar.js");
const { buildMaterialCandidatesForSurvey } = await import("../src/estimate/material-candidates.js");
const { practicalSearchV1 } = await import("../src/search/practical-search-v1.js");
const { upsertProjectCaseChain } = await import("../src/projects/project-case-chain.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("実務PWA v2 — Calendar / Projects / Search", () => {
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

  it("カテゴリ自動判定", () => {
    assert.equal(classifyEventCategory("防犯カメラ設置"), "construction");
    assert.equal(classifyEventCategory("見積書まとめ"), "office");
    assert.equal(classifyEventCategory("家族の予定"), "family");
    assert.equal(classifyEventCategory("緊急対応"), "urgent");
  });

  it("POST /schedule/v1/sync でローカル保存", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const start = week.body.startDate;
    const end = week.body.endDate;
    const events = mockCalendarEvents(start, end);
    const saved = replaceCachedCalendarEvents(start, end, events);
    assert.ok(saved > 0);

    const sync = await request(app)
      .post("/api/schedule/v1/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ startDate: start, endDate: end });
    assert.equal(sync.status, 503);
    assert.ok(String(sync.body.error).includes("Googleカレンダー未設定"));
  });

  it("GET /schedule/v1/oauth/status", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/oauth/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.oauth);
    assert.equal(typeof res.body.oauth.configured, "boolean");
  });

  it("GET /google-calendar/auth/start は未設定時503", async () => {
    const res = await request(app)
      .get("/api/google-calendar/auth/start")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 503);
    assert.ok(String(res.body.error).includes("未設定"));
  });

  it("GET /api/google-calendar/status", async () => {
    const res = await request(app)
      .get("/api/google-calendar/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.displayLabel);
    assert.equal(res.body.clientSecret, undefined);
    assert.ok(!/"clientSecret"\s*:\s*"/.test(JSON.stringify(res.body)));
  });

  it("POST /schedule/v1/sync/google は未設定時503", async () => {
    const sync = await request(app)
      .post("/api/schedule/v1/sync/google")
      .set("Authorization", `Bearer ${token}`)
      .send({ weeks: 2 });
    assert.equal(sync.status, 503);
    assert.ok(String(sync.body.error).includes("Googleカレンダー未設定"));
  });

  it("GET /projects-v1 ページ", async () => {
    const res = await request(app).get("/projects-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("現場一覧") || res.text.includes("案件一覧"));
  });

  it("GET /api/projects/v1/projects", async () => {
    const res = await request(app)
      .get("/api/projects/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
  });

  it("GET /search-v1 ページ", async () => {
    const res = await request(app).get("/search-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("検索"));
  });

  it("GET /api/search/v1", async () => {
    const res = await request(app)
      .get("/api/search/v1?q=TOMS")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.hits));
  });

  it("practicalSearchV1 は空クエリで0件", () => {
    assert.deepEqual(practicalSearchV1(""), []);
  });

  it("GET /schedule-v1/day ページ", async () => {
    const res = await request(app).get("/schedule-v1/day");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("schedule-day-v1.js"));
  });

  it("GET /api/estimate/v1/material-candidates", async () => {
    const res = await request(app)
      .get("/api/estimate/v1/material-candidates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.groups?.length > 0);
    const camera = res.body.groups.find((g: { category: string }) => g.category === "camera");
    assert.ok(camera?.items?.includes("PoE"));
  });

  it("buildMaterialCandidatesForSurvey 未登録はcameraデフォルト", () => {
    const groups = buildMaterialCandidatesForSurvey("nonexistent-survey-id");
    assert.equal(groups.length, 1);
    assert.equal(groups[0].category, "camera");
  });

  it("project_case_chain upsert", () => {
    const chain = upsertProjectCaseChain({
      surveyProjectId: "SVY-TEST-001",
      businessProjectId: "BIZ-TEST-001",
      customerCode: "TOMS001",
    });
    assert.ok(chain.caseNo.startsWith("CASE-"));
    assert.equal(chain.surveyProjectId, "SVY-TEST-001");
  });

  it("下部ナビ案件一覧が /projects-v1", async () => {
    const res = await request(app).get("/js/tisly-practical-nav.js");
    assert.ok(res.text.includes('href: "/projects-v1"'));
  });
});
