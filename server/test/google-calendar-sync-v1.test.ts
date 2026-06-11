import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-gcal-sync-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-google-calendar-sync-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.GOOGLE_CALENDAR_ENABLED = "false";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { runFullGoogleCalendarSyncV1 } = await import(
  "../src/schedule/google-calendar-sync-service.js"
);
const { reflectProjectCompletionToGoogleCalendar } = await import(
  "../src/schedule/google-calendar-sync-service.js"
);

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Google Calendar 双方向同期 v1", () => {
  let token = "";
  let testDate = "";

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
    testDate = week.body.days[2].date;
  });

  after(() => closeDatabase());

  it("GET /google-calendar-settings-v1 ページを配信", async () => {
    const res = await request(app).get("/google-calendar-settings-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("Googleカレンダー連携"));
  });

  it("未知の Practical PWA パスは TiSLY 404 ページ", async () => {
    const res = await request(app).get("/unknown-practical-pwa-route");
    assert.equal(res.status, 404);
    assert.ok(res.text.includes("ページが見つかりません"));
  });

  it("GET /api/google-calendar/status に settings を含む", async () => {
    const res = await request(app)
      .get("/api/google-calendar/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.settings);
    assert.equal(res.body.settings.syncDirection, "bidirectional");
  });

  it("GET /api/google-calendar/calendars モック一覧", async () => {
    const res = await request(app)
      .get("/api/google-calendar/calendars")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.calendars));
    assert.ok(res.body.calendars.length >= 1);
  });

  it("PATCH /api/google-calendar/settings でカレンダー選択", async () => {
    const res = await request(app)
      .patch("/api/google-calendar/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        calendarId: "primary",
        calendarSummary: "メイン",
        autoCreateProjects: true,
        syncDirection: "bidirectional",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.calendarId, "primary");
  });

  it("POST /api/google-calendar/sync/full は未設定時503", async () => {
    const res = await request(app)
      .post("/api/google-calendar/sync/full")
      .set("Authorization", `Bearer ${token}`)
      .send({ weeks: 4 });
    assert.equal(res.status, 503);
    assert.ok(String(res.body.error).includes("Googleカレンダー未設定"));
    assert.equal(res.body.mode, "mock");
  });

  it("env 設定済み時は status が live", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    try {
      const res = await request(app)
        .get("/api/google-calendar/status")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.mode, "live");
      assert.equal(res.body.configured, true);
      assert.deepEqual(res.body.missingEnv, []);
      assert.equal(res.body.clientSecret, undefined);
    } finally {
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("GET /auth/google は未設定時 settings へリダイレクト", async () => {
    const res = await request(app).get("/auth/google");
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes("google-calendar-settings-v1"));
  });

  it("Google予定から案件自動生成（live env + mock provider）", async () => {
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    const { setCalendarProvider, MockGoogleCalendarProvider } = await import(
      "../src/services/googleCalendar.js"
    );
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    setCalendarProvider(new MockGoogleCalendarProvider());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("googleapis.com/calendar")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
    getDatabase().prepare(`DELETE FROM google_calendar_event_links`).run();
    let result;
    try {
      result = await runFullGoogleCalendarSyncV1({ weeks: 4 });
      assert.ok(result.pulled >= 0);
      assert.equal(result.mode, "real");
      const linkCount = (
        getDatabase().prepare(`SELECT COUNT(*) as c FROM google_calendar_event_links`).get() as {
          c: number;
        }
      ).c;
      assert.ok(linkCount >= 0);
      if (result.projectsCreated > 0) {
        const row = getDatabase()
          .prepare(`SELECT project_id FROM google_calendar_event_links LIMIT 1`)
          .get() as { project_id?: string };
        assert.ok(row?.project_id?.startsWith("SVY-"));
      }
    } finally {
      globalThis.fetch = originalFetch;
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("作業完了でGoogleカレンダー反映（モック）", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "完了反映テスト",
        siteName: "カレンダー完了テスト",
        surveyDate: testDate,
      });
    assert.equal(survey.status, 201);
    const projectId = survey.body.projectId as string;
    getDatabase()
      .prepare(
        `INSERT INTO google_calendar_event_links
         (id, google_event_id, google_calendar_id, project_source, project_id, schedule_event_id, link_kind, created_at, updated_at)
         VALUES (?, ?, 'primary', 'survey', ?, NULL, 'linked', datetime('now'), datetime('now'))`
      )
      .run("link-complete-1", "mock-event-complete-1", projectId);

    const reflected = await reflectProjectCompletionToGoogleCalendar(
      { projectId, source: "survey" },
      new Date().toISOString()
    );
    assert.equal(reflected.updated, true);
    assert.equal(reflected.mode, "mock");
  });

  it("GET /auth/google/callback モック OAuth", async () => {
    const res = await request(app).get("/auth/google/callback?code=mock");
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes("google-calendar-settings-v1"));
  });

  it("出発リマインダー API が最初の現場のみ対象", async () => {
    getDatabase()
      .prepare(`DELETE FROM schedule_calendar_events WHERE event_date = ?`)
      .run(testDate);
    getDatabase()
      .prepare(
        `INSERT INTO schedule_calendar_events
         (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
         VALUES (?, ?, ?, ?, 'construction', 'mock', '08:00', '10:00', 0, '', '', datetime('now')),
                (?, ?, ?, ?, 'construction', 'mock', '13:00', '15:00', 0, '', '', datetime('now'))`
      )
      .run(
        "dep-a",
        "ext-a",
        testDate,
        "1件目現場",
        "dep-b",
        "ext-b",
        testDate,
        "2件目現場"
      );
    const res = await request(app)
      .get(`/api/schedule/v1/departures?date=${testDate}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.departure.eventTitle, "1件目現場");
    assert.equal(res.body.departure.reminderMinutesBefore, 30);
  });
});
