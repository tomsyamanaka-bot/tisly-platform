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
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { calcAvailability } = await import("../src/schedule/schedule-store.js");
const { todayInTimeZone, getScheduleWindowStartWithOffset } = await import(
  "../src/services/googleCalendar.js"
);

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

  it("週間表示を取得できる（今日から7日間）", async () => {
    const today = todayInTimeZone();
    const res = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.label, "今日から7日間");
    assert.equal(res.body.startDate, today);
    assert.equal(res.body.today, today);
    assert.equal(res.body.days.length, 7);
    assert.equal(res.body.days[0].date, today);
    assert.ok(res.body.summary);
    assert.ok(typeof res.body.days[0].availability.stars === "string");
    for (const day of res.body.days) {
      assert.ok(day.date >= today, `過去日が含まれています: ${day.date}`);
    }
  });

  it("次の7日間へ切替でき、過去ウィンドウには戻らない", async () => {
    const today = todayInTimeZone();
    const prev = await request(app)
      .get("/api/schedule/v1/week?offset=-1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(prev.status, 200);
    assert.equal(prev.body.startDate, today);
    assert.equal(prev.body.label, "今日から7日間");
    const next = await request(app)
      .get("/api/schedule/v1/week?offset=1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(next.status, 200);
    assert.equal(next.body.label, "1週間後");
    assert.equal(next.body.startDate, getScheduleWindowStartWithOffset(1));
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

  it("GET /oauth/status に連携ステータスが含まれる", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/oauth/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.calendarIntegration.label, "未設定（mock）");
    assert.equal(res.body.mapsIntegration.label, "未設定");
    assert.ok(res.body.mapsIntegration.hint.includes("ナビ起動のみ"));
    assert.equal(res.body.calendarStatus.displayStatus, "not_configured");
    assert.equal(res.body.calendarStatus.mode, "mock");
    assert.equal(res.body.calendarStatus.buttonLabel, "Google連携は未設定です");
  });

  it("GET /api/google-calendar/status は Secret を返さない", async () => {
    const res = await request(app)
      .get("/api/google-calendar/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.displayStatus, "not_configured");
    assert.equal(res.body.displayLabel, "未設定（mock）");
    assert.equal(res.body.mode, "mock");
    assert.equal(res.body.configured, false);
    assert.ok(Array.isArray(res.body.missingEnv));
    assert.ok(res.body.missingEnv.includes("GOOGLE_CALENDAR_ENABLED"));
    assert.equal(typeof res.body.configured, "boolean");
    assert.equal(typeof res.body.clientIdConfigured, "boolean");
    assert.equal(typeof res.body.clientSecretConfigured, "boolean");
    assert.ok(res.body.sync);
    assert.ok(res.body.scope);
    assert.equal(typeof res.body.scope.hasWriteAccess, "boolean");
    assert.equal(res.body.clientSecret, undefined);
    assert.equal(res.body.clientSecretValue, undefined);
    assert.equal(res.body.refreshToken, undefined);
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes("GOCSPX-"));
    assert.ok(!/"clientSecret"\s*:\s*"/.test(raw));
    assert.ok(!raw.includes("refresh_token"));
  });

  it("Google未設定でも schedule API は 200 を返す", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(week.status, 200);
    const status = await request(app)
      .get("/api/google-calendar/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.mode, "mock");
    const sync = await request(app)
      .post("/api/schedule/v1/sync/google")
      .set("Authorization", `Bearer ${token}`)
      .send({ weeks: 1 });
    assert.equal(sync.status, 503);
    assert.equal(sync.body.ok, false);
    assert.ok(String(sync.body.message).includes("Googleカレンダー未設定"));
    assert.equal(sync.body.details?.mode, "mock");
    assert.notEqual(sync.body.message, "Bad Request");
  });

  it("日付詳細に移動時間ブロックとMaps連携状態が含まれる", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const date = week.body.days[1].date;
    const eventId = "test-travel-1";
    getDatabase()
      .prepare(
        `INSERT INTO schedule_calendar_events
         (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
         VALUES (?, ?, ?, ?, 'construction', 'mock', '09:00', '12:00', 0, 'つくばみらい市', '', datetime('now'))`
      )
      .run(eventId, "ext-travel", date, "防犯カメラ設置");
    const detail = await request(app)
      .get(`/api/schedule/v1/day?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.body.travelBlocks));
    assert.ok(detail.body.travelBlocks.length >= 1);
    const current = detail.body.travelBlocks.find(
      (b: { kind: string }) => b.kind === "current_to_site"
    );
    assert.ok(current);
    assert.ok(current.durationMin >= 1);
    assert.ok(current.mapsUrl.includes("google.com/maps"));
    assert.equal(detail.body.mapsIntegration.mode, "nav_only");
    assert.equal(detail.body.mapsIntegration.label, "未設定");
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

  it("日付メモを保存・取得できる（現場不可とは別）", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const date = week.body.days[2].date;

    const empty = await request(app)
      .get(`/api/schedule/v1/day-note?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(empty.status, 200);
    assert.equal(empty.body.note, "");

    const saved = await request(app)
      .patch("/api/schedule/v1/day-note")
      .set("Authorization", `Bearer ${token}`)
      .send({ date, note: "午後は事務所で打合せ" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.note, "午後は事務所で打合せ");

    const loaded = await request(app)
      .get(`/api/schedule/v1/day-note?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.note, "午後は事務所で打合せ");

    const detail = await request(app)
      .get(`/api/schedule/v1/day?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.memo, "午後は事務所で打合せ");

    const withRemark = await request(app)
      .patch("/api/schedule/v1/day-note")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date,
        note: "午後は事務所で打合せ",
        eventRemark: "14時からお客様来社",
        unavailableReason: "",
        detailMemo: "",
      });
    assert.equal(withRemark.status, 200);
    assert.equal(withRemark.body.eventRemark, "14時からお客様来社");

    const detail2 = await request(app)
      .get(`/api/schedule/v1/day?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail2.body.eventRemark, "14時からお客様来社");
  });

  it("Googleカレンダー予定のdescriptionが日詳細に含まれる", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const date = week.body.days[3].date;
    const eventId = "test-gcal-desc-1";
    getDatabase()
      .prepare(
        `INSERT INTO schedule_calendar_events
         (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
         VALUES (?, ?, ?, ?, 'construction', 'google', '08:30', '12:00', 0, '守谷市', '既設カメラ撤去、LAN引き直し', datetime('now'))`
      )
      .run(eventId, "ext-1", date, "防犯カメラ設置");
    const detail = await request(app)
      .get(`/api/schedule/v1/day?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    const ev = detail.body.day.events.find((e: { id: string }) => e.id === eventId);
    assert.ok(ev);
    assert.equal(ev.description, "既設カメラ撤去、LAN引き直し");
    assert.equal(ev.location, "守谷市");
  });

  it("現場不可の詳細メモを保存できる", async () => {
    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const date = week.body.days[4].date;
    const created = await request(app)
      .post("/api/schedule/v1/unavailable")
      .set("Authorization", `Bearer ${token}`)
      .send({ date, reason: "材料待ち", detailMemo: "午前だけ対応可" });
    assert.equal(created.status, 201);
    assert.equal(created.body.detailMemo, "午前だけ対応可");
    const patched = await request(app)
      .patch(`/api/schedule/v1/unavailable/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ detailMemo: "外作業NG・材料待ち" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.detailMemo, "外作業NG・材料待ち");
    const detail = await request(app)
      .get(`/api/schedule/v1/day?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.day.unavailable.detailMemo, "外作業NG・材料待ち");
    await request(app)
      .delete(`/api/schedule/v1/unavailable/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
  });

  it("現場不可日を登録・更新・削除できる", async () => {
    const date = todayInTimeZone();

    const created = await request(app)
      .post("/api/schedule/v1/unavailable")
      .set("Authorization", `Bearer ${token}`)
      .send({ date, reason: "事務処理" });
    assert.equal(created.status, 201);
    unavailableId = created.body.id;

    const week = await request(app)
      .get("/api/schedule/v1/week?offset=0")
      .set("Authorization", `Bearer ${token}`);
    const todayDay = week.body.days.find((d: { date: string }) => d.date === date);
    assert.ok(todayDay?.unavailable);
    assert.equal(todayDay.unavailable.reason, "事務処理");

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
    const idxSchedule = res.text.indexOf('label: "日程"');
    const idxSurvey = res.text.indexOf('label: "現調"');
    const idxEstimate = res.text.indexOf('label: "見積"');
    const idxBilling = res.text.indexOf('label: "請求"');
    const idxProjects = res.text.indexOf('label: "案件"');
    assert.ok(idxSchedule >= 0 && idxSurvey > idxSchedule);
    assert.ok(idxEstimate > idxSurvey);
    assert.ok(idxBilling > idxEstimate);
    assert.ok(idxProjects > idxBilling);
  });
});
