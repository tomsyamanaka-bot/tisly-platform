import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-departure-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-departure-reminder-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  calcDefaultDepartureTime,
  calcReminderTime,
  findFirstConstructionEvent,
  subtractMinutes,
} = await import("../src/schedule/schedule-day-departures-store.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("出発リマインダー + 持ち物通知 v1", () => {
  let token = "";
  let testDate = "";
  let departureId = "";

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

    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    testDate = week.body.days[3].date;
    getDatabase()
      .prepare(`DELETE FROM schedule_calendar_events WHERE event_date = ?`)
      .run(testDate);
    getDatabase()
      .prepare(`DELETE FROM schedule_day_departures WHERE departure_date = ?`)
      .run(testDate);
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "出発テスト",
        siteName: "防犯カメラ設置",
        surveyDate: testDate,
      });
    assert.equal(survey.status, 201);
    const surveyProjectId = survey.body.projectId as string;

    getDatabase()
      .prepare(
        `INSERT INTO schedule_calendar_events
         (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
         VALUES (?, ?, ?, ?, 'construction', 'mock', '08:30', '12:00', 0, 'つくばみらい市', '', datetime('now'))`
      )
      .run("dep-first-1", "ext-dep-1", testDate, "防犯カメラ設置");
    getDatabase()
      .prepare(
        `INSERT INTO schedule_calendar_events
         (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
         VALUES (?, ?, ?, ?, 'construction', 'mock', '14:00', '17:00', 0, '守谷市', '', datetime('now'))`
      )
      .run("dep-second-1", "ext-dep-2", testDate, "換気扇交換");
    getDatabase()
      .prepare(`DELETE FROM schedule_day_departures WHERE departure_date = ?`)
      .run(testDate);
  });

  after(() => closeDatabase());

  it("移動時間から出発時間を自動計算できる", () => {
    assert.equal(calcDefaultDepartureTime("08:30", 28), "07:52");
    assert.equal(subtractMinutes("08:30", 38), "07:52");
    assert.equal(calcReminderTime("07:52", 30), "07:22");
  });

  it("最初の工事予定だけを判定できる", () => {
    const events = [
      { id: "a", date: testDate, title: "防犯カメラ設置", category: "construction", source: "mock", startTime: "08:30" },
      { id: "b", date: testDate, title: "換気扇交換", category: "construction", source: "mock", startTime: "14:00" },
      { id: "c", date: testDate, title: "事務", category: "office", source: "mock", startTime: "09:00" },
    ] as Parameters<typeof findFirstConstructionEvent>[0];
    const first = findFirstConstructionEvent(events);
    assert.equal(first?.id, "a");
    assert.equal(first?.title, "防犯カメラ設置");
  });

  it("GET /departures で出発情報を取得・自動作成できる", async () => {
    const res = await request(app)
      .get(`/api/schedule/v1/departures?date=${testDate}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.date, testDate);
    assert.ok(res.body.departure);
    assert.equal(res.body.departure.firstEventId, "dep-first-1");
    assert.match(res.body.departure.departureTime, /^\d{2}:\d{2}$/);
    assert.equal(res.body.departure.reminderMinutesBefore, 30);
    assert.equal(res.body.departure.reminderEnabled, true);
    departureId = res.body.departure.id;
  });

  it("週間表示は工事予定がある日だけ departure を付与する", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const day = week.body.days.find((d: { date: string }) => d.date === testDate);
    assert.ok(day?.departure);
    assert.equal(day.firstConstructionEventId, "dep-first-1");
    const construction = day.events.filter((e: { category: string }) => e.category === "construction");
    assert.equal(construction.length, 2);
    const dayWithoutConstruction = week.body.days.find(
      (d: { date: string; events: Array<{ category: string }> }) =>
        d.date !== testDate && !d.events.some((e) => e.category === "construction")
    );
    if (dayWithoutConstruction) {
      assert.equal(dayWithoutConstruction.departure ?? null, null);
    }
  });

  it("手動変更が保存される", async () => {
    const patched = await request(app)
      .patch(`/api/schedule/v1/departures/${departureId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ departureTime: "07:45", reminderEnabled: false });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.departureTime, "07:45");
    assert.equal(patched.body.reminderEnabled, false);
    assert.equal(patched.body.reminderTime, "07:15");

    const loaded = await request(app)
      .get(`/api/schedule/v1/departures?date=${testDate}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(loaded.body.departure.departureTime, "07:45");
  });

  it("通知タップURLが field-check-v1 になる", async () => {
    const notify = await request(app)
      .post(`/api/schedule/v1/departures/${departureId}/test-notify`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(notify.status, 200);
    assert.ok(notify.body.notification.url.includes("/field-check-v1"));
    assert.ok(notify.body.notification.url.includes("projectId="));
    assert.ok(notify.body.notification.url.includes(`date=${testDate}`));
    assert.ok(notify.body.notification.title.includes("出発準備"));
    assert.ok(notify.body.notification.body.includes("材料チェック"));
  });

  it("日詳細 API に departure が含まれる", async () => {
    const detail = await request(app)
      .get(`/api/schedule/v1/day?date=${testDate}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.departure);
    assert.equal(detail.body.departure.departureTime, "07:45");
    assert.equal(detail.body.departure.firstEventId, "dep-first-1");
  });

  it("ダッシュボードに今日の出発カード情報がある", async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== testDate) return;
    const dash = await request(app)
      .get("/api/projects/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(dash.status, 200);
    assert.ok(dash.body.todayDeparture);
    assert.match(dash.body.todayDeparture.departureTime, /^\d{2}:\d{2}$/);
    assert.ok(dash.body.todayDeparture.fieldCheckUrl?.includes("/field-check-v1"));
  });

  it("departure-reminder.js が配信される", async () => {
    const res = await request(app).get("/js/departure-reminder.js");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("field-check-v1"));
    assert.ok(res.text.includes("departure-alert-card"));
    assert.ok(res.text.includes("data-departure-accordion"));
    assert.ok(res.text.includes("departure-kit-btn"));
  });

  it("field-check-v1 が projectId クエリに対応する", async () => {
    const html = await request(app).get("/field-check-v1");
    assert.equal(html.status, 200);
    const js = await request(app).get("/js/field-check-v1.js");
    assert.ok(js.text.includes("openFromQueryParams"));
    assert.ok(js.text.includes("材料を追加"));
    assert.ok(js.text.includes("check-item-label"));
  });
});
