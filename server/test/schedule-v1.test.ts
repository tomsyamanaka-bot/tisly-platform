import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-schedule-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-schedule-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { calcAvailability } = await import("../src/schedule/schedule-store.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("日程調整 PWA v1 API", () => {
  let token = "";
  let unavailableId = "";

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

  it("空き度を件数から算出できる", () => {
    assert.equal(calcAvailability(0, false).stars, "★★★★★");
    assert.equal(calcAvailability(2, false).stars, "★★★★☆");
    assert.equal(calcAvailability(4, false).stars, "★★☆☆☆");
    assert.equal(calcAvailability(5, false).stars, "満車");
    assert.equal(calcAvailability(0, true).level, "unavailable");
  });

  it("GET /schedule-v1 ページを配信できる", async () => {
    const res = await request(app).get("/schedule-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("日程調整"));
    assert.ok(res.text.includes("schedule-v1.js"));
    assert.ok(res.text.includes("週間"));
  });

  it("週間表示を取得できる", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.label, "今週");
    assert.equal(res.body.days.length, 7);
    assert.ok(res.body.summary);
    assert.ok(typeof res.body.days[0].availability.stars === "string");
  });

  it("前週・来週を切替できる", async () => {
    const prev = await request(app)
      .get("/api/schedule/v1/week?offset=-1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(prev.status, 200);
    assert.equal(prev.body.label, "前週");
    const next = await request(app)
      .get("/api/schedule/v1/week?offset=1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(next.status, 200);
    assert.equal(next.body.label, "来週");
  });

  it("3週間表示を取得できる", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/three-weeks?offset=0")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.blocks.length, 3);
    assert.ok(res.body.blocks[0].constructionCount >= 0);
    assert.equal(res.body.blocks[0].days.length, 7);
  });

  it("日付詳細・天気を取得できる", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const date = week.body.days[0].date;
    const detail = await request(app)
      .get(`/api/schedule/v1/day?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.day.date, date);
    assert.equal(detail.body.weather.slots.length, 3);
    const weather = await request(app)
      .get(`/api/schedule/v1/weather?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(weather.status, 200);
    assert.ok(weather.body.location);
  });

  it("月間表示を取得できる", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/month?year=2026&month=6")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.year, 2026);
    assert.equal(res.body.month, 6);
    assert.ok(res.body.weeks.length >= 4);
  });

  it("週間サマリーを取得できる", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/summary?range=week&offset=0")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.range, "week");
    assert.ok("totalEvents" in res.body.summary);
  });

  it("現場不可日を登録・更新・削除できる", async () => {
    const monday = new Date();
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    const date = monday.toISOString().slice(0, 10);

    const created = await request(app)
      .post("/api/schedule/v1/unavailable")
      .set("Authorization", `Bearer ${token}`)
      .send({ date, reason: "事務処理" });
    assert.equal(created.status, 201);
    unavailableId = created.body.id;

    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const mondayDay = week.body.days.find((d: { date: string }) => d.date === date);
    assert.ok(mondayDay?.unavailable);
    assert.equal(mondayDay.unavailable.reason, "事務処理");

    const patched = await request(app)
      .patch(`/api/schedule/v1/unavailable/${unavailableId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "家族予定" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.reason, "家族予定");

    const del = await request(app)
      .delete(`/api/schedule/v1/unavailable/${unavailableId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 204);
  });

  it("未ログイン時は401", async () => {
    const res = await request(app).get("/api/schedule/v1/week");
    assert.equal(res.status, 401);
  });

  it("下部ナビが指定順になっている", async () => {
    const res = await request(app).get("/js/tisly-practical-nav.js");
    assert.equal(res.status, 200);
    const idxSchedule = res.text.indexOf('label: "日程調整"');
    const idxSurvey = res.text.indexOf('label: "現調"');
    const idxEstimate = res.text.indexOf('label: "見積"');
    const idxBilling = res.text.indexOf('label: "請求"');
    const idxProjects = res.text.indexOf('label: "案件一覧"');
    assert.ok(idxSchedule >= 0 && idxSurvey > idxSchedule);
    assert.ok(idxEstimate > idxSurvey);
    assert.ok(idxBilling > idxEstimate);
    assert.ok(idxProjects > idxBilling);
  });
});
