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
    assert.equal(res.body.usedFallback, false);
    assert.ok(Array.isArray(res.body.allCalendars));
    for (const c of res.body.calendars) {
      assert.notEqual(c.writable, false, `writable calendar expected: ${c.id}`);
      assert.ok(c.summary);
      assert.ok(c.id);
    }
    const readonly = res.body.allCalendars.find((c: { id: string }) => c.id === "mock-readonly");
    if (readonly) assert.equal(readonly.writable, false);
  });

  it("PATCH settings syncMode + calendarIds を保存", async () => {
    const res = await request(app)
      .patch("/api/google-calendar/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        calendarId: "mock-work",
        calendarSummary: "★TOMS★（モック）",
        syncMode: "multiple",
        calendarIds: ["primary", "mock-work"],
        syncDirection: "bidirectional",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.syncMode, "multiple");
    assert.deepEqual(res.body.settings.calendarIds, ["primary", "mock-work"]);
    await request(app)
      .patch("/api/google-calendar/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        calendarId: "primary",
        calendarSummary: "メインカレンダー",
        syncMode: "selected_only",
        calendarIds: ["primary"],
        syncDirection: "bidirectional",
      });
  });

  it("resolveTargetCalendarIds — primary_only は primary のみ", async () => {
    const { resolveTargetCalendarIds } = await import(
      "../src/schedule/google-calendar-target-calendars.js"
    );
    const { saveGoogleCalendarSettingsV1 } = await import(
      "../src/schedule/google-calendar-sync-store.js"
    );
    saveGoogleCalendarSettingsV1({ syncMode: "primary_only", calendarId: "mock-work" });
    const ids = resolveTargetCalendarIds(
      { syncMode: "primary_only", calendarId: "mock-work", calendarIds: ["mock-work"] } as import("../src/schedule/google-calendar-sync-store.js").GoogleCalendarSettingsV1,
      [
        { id: "primary", summary: "メイン", primary: true, accessRole: "owner", writable: true },
        { id: "mock-work", summary: "TOMS", primary: false, accessRole: "writer", writable: true },
      ]
    );
    assert.deepEqual(ids, ["primary"]);
  });

  it("calendars 403時は primary フォールバック + needsRelogin", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("calendar/v3/users/me/calendarList")) {
        return new Response(
          JSON.stringify({
            error: { message: "Insufficient Permission", code: 403, status: "PERMISSION_DENIED" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };
    try {
      const res = await request(app)
        .get("/api/google-calendar/calendars")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.usedFallback, true);
      assert.equal(res.body.calendars[0].id, "primary");
      assert.equal(res.body.needsRelogin, true);
      assert.ok(String(res.body.warning).includes("再ログイン"));
      assert.equal(res.body.code, "google_calendar_permission_denied");
      const settings = await request(app)
        .get("/api/google-calendar/status")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(settings.body.settings.calendarId, "primary");
      assert.equal(settings.body.settings.calendarSummary, "メインカレンダー");
    } finally {
      globalThis.fetch = originalFetch;
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("connected + readonly スコープ時 sync/full は needsRelogin を返す", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    getDatabase()
      .prepare(
        `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
      )
      .run(
        "google_oauth_scopes",
        JSON.stringify({
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
          scope: "https://www.googleapis.com/auth/calendar.readonly",
        })
      );
    try {
      const res = await request(app)
        .post("/api/google-calendar/sync/full")
        .set("Authorization", `Bearer ${token}`)
        .send({ selectedCalendarId: "primary", syncDirection: "two_way" });
      assert.equal(res.status, 400);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.code, "needs_relogin");
      assert.ok(String(res.body.message).includes("権限が不足"));
      assert.equal(res.body.details?.needsRelogin, true);
      assert.notEqual(res.body.message, "Bad Request");
    } finally {
      getDatabase().prepare(`DELETE FROM platform_settings WHERE key = ?`).run("google_oauth_scopes");
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("POST /api/google-calendar/diagnostics/test-event は作成→削除で成功", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("oauth2/v1/tokeninfo")) {
        return new Response(
          JSON.stringify({ scope: "https://www.googleapis.com/auth/calendar" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("calendar/v3/users/me/calendarList")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "primary", summary: "メイン", primary: true, accessRole: "owner" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/events") && method === "POST") {
        return new Response(JSON.stringify({ id: "test-oauth-event-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/events/test-oauth-event-1") && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return originalFetch(input, init);
    };
    try {
      const res = await request(app)
        .post("/api/google-calendar/diagnostics/test-event")
        .set("Authorization", `Bearer ${token}`)
        .send({ calendarId: "primary" });
      assert.equal(res.status, 200);
      assert.equal(res.body.testEvent.ok, true);
      assert.equal(res.body.testEvent.deleted, true);
      assert.equal(res.body.tokenScopeShort, "calendar");
      assert.equal(typeof res.body.needsRelogin, "boolean");
      assert.equal(res.body.googleApiError, null);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("sync/full 失敗時に safe log details を返す", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    getDatabase()
      .prepare(
        `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
      )
      .run(
        "google_oauth_scopes",
        JSON.stringify({
          scopes: ["https://www.googleapis.com/auth/calendar"],
          scope: "https://www.googleapis.com/auth/calendar",
        })
      );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("calendar/v3/users/me/calendarList")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "primary", summary: "メイン", primary: true, accessRole: "owner" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("googleapis.com/calendar") && url.includes("/events")) {
        return new Response(
          JSON.stringify({
            error: { message: "Forbidden", code: 403, status: "PERMISSION_DENIED" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };
    try {
      const res = await request(app)
        .post("/api/google-calendar/sync/full")
        .set("Authorization", `Bearer ${token}`)
        .send({ selectedCalendarId: "primary", weeks: 1 });
      assert.equal(res.status, 500);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.details?.httpStatus, 403);
      assert.ok(String(res.body.details?.errorHint).includes("権限不足"));
      assert.equal(res.body.details?.googleErrorCode, 403);
    } finally {
      globalThis.fetch = originalFetch;
      getDatabase().prepare(`DELETE FROM platform_settings WHERE key = ?`).run("google_oauth_scopes");
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("GET /api/google-calendar/status に診断フィールドを含む", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("calendar/v3/users/me/calendarList")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "primary", summary: "メイン", primary: true, accessRole: "owner" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("oauth2/v1/tokeninfo")) {
        return new Response(
          JSON.stringify({ scope: "https://www.googleapis.com/auth/calendar" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };
    try {
      const res = await request(app)
        .get("/api/google-calendar/status")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.hasAccessToken, "boolean");
      assert.equal(typeof res.body.hasRefreshToken, "boolean");
      assert.equal(typeof res.body.tokenScope, "string");
      assert.equal(res.body.tokenScopeShort, "calendar");
      assert.ok("tokenExpiry" in res.body);
      assert.equal(typeof res.body.needsRelogin, "boolean");
      assert.equal(typeof res.body.calendarListOk, "boolean");
      assert.ok(res.body.selectedCalendarId);
      assert.ok("lastSyncSafeLog" in res.body);
      assert.equal(res.body.access_token, undefined);
      assert.equal(res.body.refresh_token, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("POST /api/google-calendar/sync/full は日付不正時400（日本語）", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    try {
      const res = await request(app)
        .post("/api/google-calendar/sync/full")
        .set("Authorization", `Bearer ${token}`)
        .send({ startDate: "invalid", endDate: "2026-06-01" });
      assert.equal(res.status, 400);
      assert.equal(res.body.ok, false);
      assert.ok(String(res.body.message).includes("取得範囲"));
      assert.notEqual(res.body.message, "Bad Request");
      assert.ok(res.body.code);
    } finally {
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("POST /api/google-calendar/sync/full は空パラメータでも primary で同期", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("calendar/v3/users/me/calendarList")) {
        return new Response(
          JSON.stringify({
            error: { message: "Insufficient Permission", code: 403, status: "PERMISSION_DENIED" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("googleapis.com/calendar")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
    try {
      const res = await request(app)
        .post("/api/google-calendar/sync/full")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.calendarId, "primary");
      assert.ok(res.body.startDate);
      assert.ok(res.body.endDate);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("POST /api/schedule/v1/sync/google は未指定フィールドを補完して同期", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { saveGoogleRefreshToken } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    saveGoogleRefreshToken("test-refresh-token");
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
    try {
      const res = await request(app)
        .post("/api/schedule/v1/sync/google")
        .set("Authorization", `Bearer ${token}`)
        .send({
          selectedCalendarId: "",
          syncDirection: "",
          weekOffset: "",
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(typeof res.body.count === "number");
      assert.ok(res.body.startDate);
      assert.ok(res.body.endDate);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("POST /api/google-calendar/sync/full は未ログイン時503（live env）", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    const { clearGoogleCalendarTokens } = await import("../src/services/googleOAuthService.js");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    clearGoogleCalendarTokens();
    try {
      const res = await request(app)
        .post("/api/google-calendar/sync/full")
        .set("Authorization", `Bearer ${token}`)
        .send({ weeks: 1, selectedCalendarId: "primary", syncDirection: "two_way" });
      assert.equal(res.status, 503);
      assert.equal(res.body.ok, false);
      assert.ok(String(res.body.message).includes("Googleカレンダー未設定"));
      assert.notEqual(res.body.message, "Bad Request");
    } finally {
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
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
    assert.equal(res.body.ok, false);
    assert.ok(String(res.body.message).includes("Googleカレンダー未設定"));
    assert.equal(res.body.details?.mode, "mock");
    assert.notEqual(res.body.message, "Bad Request");
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
    const { saveGoogleCalendarSettingsV1 } = await import(
      "../src/schedule/google-calendar-sync-store.js"
    );
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
    saveGoogleCalendarSettingsV1({
      calendarId: "primary",
      calendarSummary: "メインカレンダー",
      syncMode: "primary_only",
      calendarIds: ["primary"],
      syncDirection: "bidirectional",
    });
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
      if (url.includes("/events") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: `mock-push-${Date.now()}` }), {
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
    const loc = res.headers.location ?? "";
    assert.ok(loc.includes("google-calendar-settings-v1"));
    assert.ok(loc.includes("oauth=ok"));
    assert.ok(loc.includes("oauth_callback=reached"));
  });

  it("GET /auth/google/callback org_internal はデバッグ付きで settings へ", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "519543-test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    try {
      const res = await request(app).get(
        "/auth/google/callback?error=org_internal&error_description=Only+users+in+the+org"
      );
      assert.equal(res.status, 302);
      const loc = decodeURIComponent(res.headers.location ?? "");
      assert.ok(loc.includes("oauth_error=org_internal"));
      assert.ok(loc.includes("oauth_callback=reached"));
      assert.ok(loc.includes("oauth_redirect_uri=https://tisly.jp/auth/google/callback"));
      assert.ok(loc.includes("oauth_client_id=519543"));
      assert.ok(loc.includes("Internal"));
    } finally {
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("GET /api/google-calendar/status に oauthDebug を含む", async () => {
    const prev = {
      enabled: process.env.GOOGLE_CALENDAR_ENABLED,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GOOGLE_REDIRECT_URI,
    };
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "519543-test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://tisly.jp/auth/google/callback";
    try {
      const res = await request(app)
        .get("/api/google-calendar/status")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.oauthDebug.redirectUri, "https://tisly.jp/auth/google/callback");
      assert.equal(res.body.oauthDebug.redirectUriMatchesExpected, true);
      assert.ok(res.body.oauthDebug.clientIdMasked.startsWith("519543"));
      assert.equal(
        res.body.oauthDebug.scopes,
        "https://www.googleapis.com/auth/calendar"
      );
    } finally {
      process.env.GOOGLE_CALENDAR_ENABLED = prev.enabled;
      process.env.GOOGLE_CLIENT_ID = prev.clientId;
      process.env.GOOGLE_CLIENT_SECRET = prev.clientSecret;
      process.env.GOOGLE_REDIRECT_URI = prev.redirect;
    }
  });

  it("POST /api/debug/google-calendar/create-test-event は未設定時503", async () => {
    const res = await request(app)
      .post("/api/debug/google-calendar/create-test-event")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.ok(res.body.env);
  });

  it("設定画面に開発情報カードがある", async () => {
    const html = fs.readFileSync(
      new URL("../public/google-calendar-settings-v1.html", import.meta.url),
      "utf8"
    );
    assert.ok(html.includes("開発情報"));
    assert.ok(html.includes("dev-token-scope"));
    assert.ok(html.includes("oauth-debug-panel"));
    assert.ok(html.includes("dev-redirect-uri"));
    assert.ok(html.includes("btn-test-event"));
    assert.ok(html.includes("sync-mode"));
    assert.ok(html.includes("cal-debug-table"));
    assert.ok(html.includes("btn-sync-test"));
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

  it("フロントは API message を toast に使う（汎用 Bad Request 禁止）", async () => {
    const js = fs.readFileSync(
      new URL("../public/js/google-calendar-settings-v1.js", import.meta.url),
      "utf8"
    );
    assert.ok(js.includes("apiErrorMessage"));
    assert.ok(js.includes("data?.message"));
    assert.ok(js.includes("renderDevInfo"));
    assert.ok(js.includes("renderOAuthDebugFromParams"));
    assert.ok(js.includes("formatGoogleApiErrorHintFromLog"));
    assert.ok(js.includes("formatSyncErrorForUi"));
    assert.ok(js.includes("formatSyncSuccessLines"));
    assert.ok(!js.includes("primary（読込失敗）"));
    const scheduleJs = fs.readFileSync(
      new URL("../public/js/schedule-v1.js", import.meta.url),
      "utf8"
    );
    assert.ok(scheduleJs.includes("formatSyncErrorForUi"));
    assert.ok(scheduleJs.includes("formatSyncSuccessToast"));
    assert.ok(scheduleJs.includes("apiErrorMessage"));
  });

  it("同じGoogle予定を2回UPSERTしてもUNIQUE制約エラーにならない", async () => {
    const { upsertCachedCalendarEvents } = await import("../src/schedule/schedule-calendar-store.js");
    const { buildGoogleEventLocalId } = await import(
      "../src/schedule/google-calendar-target-calendars.js"
    );
    const start = "2026-06-01";
    const end = "2026-06-30";
    const ev = {
      id: buildGoogleEventLocalId("primary", "dup-event-1"),
      externalId: "dup-event-1",
      calendarId: "primary",
      date: "2026-06-10",
      title: "重複テスト予定",
      category: "construction" as const,
      source: "google" as const,
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      location: null,
      description: null,
    };
    const first = upsertCachedCalendarEvents(start, end, [ev]);
    assert.equal(first.created, 1);
    assert.equal(first.updated, 0);
    assert.equal(first.failed, 0);

    const second = upsertCachedCalendarEvents(start, end, [
      { ...ev, title: "重複テスト予定（更新）" },
    ]);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);
    assert.equal(second.failed, 0);

    const row = getDatabase()
      .prepare(`SELECT title FROM schedule_calendar_events WHERE id = ?`)
      .get(ev.id) as { title?: string };
    assert.equal(row.title, "重複テスト予定（更新）");
  });

  it("複数カレンダーで同じ google event.id でも衝突しない", async () => {
    const { upsertCachedCalendarEvents } = await import("../src/schedule/schedule-calendar-store.js");
    const { buildGoogleEventLocalId } = await import(
      "../src/schedule/google-calendar-target-calendars.js"
    );
    const start = "2026-06-01";
    const end = "2026-06-30";
    const sharedGoogleId = "shared-google-id-99";
    const evA = {
      id: buildGoogleEventLocalId("cal-a@group.calendar.google.com", sharedGoogleId),
      externalId: sharedGoogleId,
      calendarId: "cal-a@group.calendar.google.com",
      date: "2026-06-11",
      title: "カレンダーA",
      category: "construction" as const,
      source: "google" as const,
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      location: null,
      description: null,
    };
    const evB = {
      id: buildGoogleEventLocalId("cal-b@group.calendar.google.com", sharedGoogleId),
      externalId: sharedGoogleId,
      calendarId: "cal-b@group.calendar.google.com",
      date: "2026-06-11",
      title: "カレンダーB",
      category: "office" as const,
      source: "google" as const,
      startTime: "11:00",
      endTime: "12:00",
      allDay: false,
      location: null,
      description: null,
    };
    const stats = upsertCachedCalendarEvents(start, end, [evA, evB]);
    assert.equal(stats.failed, 0);
    assert.equal(stats.created, 2);
    assert.notEqual(evA.id, evB.id);

    const count = (
      getDatabase()
        .prepare(`SELECT COUNT(*) AS c FROM schedule_calendar_events WHERE external_id = ?`)
        .get(sharedGoogleId) as { c: number }
    ).c;
    assert.equal(count, 2);
  });

  it("モック同期を2回実行しても落ちない（UPDATE扱い）", async () => {
    const { upsertCachedCalendarEvents } = await import("../src/schedule/schedule-calendar-store.js");
    const { mockCalendarEvents } = await import("../src/services/googleCalendar.js");
    const { buildGoogleEventLocalId } = await import(
      "../src/schedule/google-calendar-target-calendars.js"
    );
    const start = "2026-06-01";
    const end = "2026-06-14";
    const events = mockCalendarEvents(start, end).map((ev) => ({
      ...ev,
      calendarId: "primary",
      externalId: ev.externalId ?? ev.id.replace(/^mock-/, "ext-"),
      id: buildGoogleEventLocalId("primary", ev.externalId ?? ev.id.replace(/^mock-/, "ext-")),
    }));
    assert.ok(events.length > 0);
    const first = upsertCachedCalendarEvents(start, end, events);
    assert.equal(first.failed, 0);
    assert.ok(first.created > 0);

    const second = upsertCachedCalendarEvents(start, end, events);
    assert.equal(second.failed, 0);
    assert.equal(second.created, 0);
    assert.equal(second.updated, events.length);
  });
});
