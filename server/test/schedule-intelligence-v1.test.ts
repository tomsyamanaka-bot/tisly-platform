import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-schedule-intel-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-schedule-intelligence-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.OPEN_METEO_LIVE = "0";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { extractEventAddress } = await import("../src/schedule/address-extract-service.js");
const {
  buildDayScheduleIntelligence,
  buildDailySummaryResponse,
  buildTravelCompactLabel,
} = await import("../src/schedule/schedule-intelligence-service.js");
const { updateSchedulePlannerSettingsV1 } = await import("../src/schedule/schedule-settings-store.js");
import type { ScheduleEvent } from "../src/schedule/schedule-types.js";
import { resolveEventProjectRef } from "../src/schedule/address-extract-service.js";

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

function baseEvent(overrides: Partial<ScheduleEvent>): ScheduleEvent {
  return {
    id: "ev-1",
    date: "2026-06-18",
    title: "守谷市リフォーム",
    category: "construction",
    source: "google",
    startTime: "09:00",
    endTime: "12:00",
    allDay: false,
    location: null,
    description: null,
    ...overrides,
  };
}

describe("日程調整レベル4 — インテリジェンス", () => {
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

  it("住所ありイベント — location 優先", () => {
    const addr = extractEventAddress(
      baseEvent({ location: "茨城県守谷市本町1-2-3", title: "リフォーム" })
    );
    assert.equal(addr.source, "location");
    assert.equal(addr.mapsAvailable, true);
    assert.ok(addr.fullAddress?.includes("守谷市"));
  });

  it("住所なしイベント — 住所未設定", () => {
    const addr = extractEventAddress(baseEvent({ title: "打合せ", location: null }));
    assert.equal(addr.source, "none");
    assert.equal(addr.displayAddress, "住所未設定");
    assert.equal(addr.mapsAvailable, false);
  });

  it("description から住所抽出", () => {
    const addr = extractEventAddress(
      baseEvent({
        location: null,
        description: "住所：茨城県柏市若柴1-1-1\n担当：山中",
      })
    );
    assert.equal(addr.source, "description");
    assert.ok(addr.fullAddress?.includes("柏市"));
  });

  it("件名のみ地名 — 住所未確定", () => {
    const addr = extractEventAddress(
      baseEvent({ title: "柏市カメラ", location: null, description: null })
    );
    assert.equal(addr.source, "title_place");
    assert.equal(addr.displayAddress, "住所未確定");
    assert.equal(addr.cityHint, "柏市");
  });

  it("1日1件 — インテリジェンス構築", async () => {
    const events = [
      baseEvent({
        id: "one",
        location: "茨城県守谷市",
        startTime: "10:00",
        endTime: "12:00",
      }),
    ];
    const intel = await buildDayScheduleIntelligence("2026-06-18", events);
    assert.equal(intel.events.length, 1);
    assert.equal(intel.events[0].travel.durationLabel, "Google Maps API未設定");
    assert.equal(intel.feasibility, "unknown");
    assert.equal(intel.totalScheduledMin, 120);
    assert.equal(intel.totalTravelMin, null);
  });

  it("1日複数件 — 総移動時間と判定フィールド", async () => {
    const events = [
      baseEvent({
        id: "a",
        title: "守谷市リフォーム",
        location: "茨城県守谷市",
        startTime: "09:00",
        endTime: "11:00",
      }),
      baseEvent({
        id: "b",
        title: "柏市カメラ",
        location: "茨城県柏市",
        startTime: "13:00",
        endTime: "15:00",
      }),
      baseEvent({
        id: "c",
        title: "流山市LAN",
        location: "千葉県流山市",
        startTime: "17:00",
        endTime: "19:00",
      }),
    ];
    const intel = await buildDayScheduleIntelligence("2026-06-18", events);
    assert.equal(intel.events.length, 3);
    assert.equal(intel.gaps.length, 2);
    assert.equal(intel.feasibility, "unknown");
    assert.equal(intel.totalTravelMin, null);
    assert.ok(intel.events[0].weatherSlots.length === 3);
    assert.equal(intel.events[0].travel.compactLabel, "🏠→現場");
    assert.equal(intel.events[1].travel.compactLabel, "現場①→現場②");
    assert.equal(intel.events[2].travel.compactLabel, "現場②→現場③");
  });

  it("移動ラベル — カード表示用 compactLabel", () => {
    assert.equal(buildTravelCompactLabel(0), "🏠→現場");
    assert.equal(buildTravelCompactLabel(1), "現場①→現場②");
    assert.equal(buildTravelCompactLabel(2), "現場②→現場③");
  });

  it("★TOMS★カレンダー予定 — calendarSummary 反映", async () => {
    const events = [
      baseEvent({
        calendarSummary: "★TOMS★",
        calendarColor: "#9a6324",
        location: "守谷市",
      }),
    ];
    const intel = await buildDayScheduleIntelligence("2026-06-18", events);
    assert.equal(intel.events[0].calendarSummary, "★TOMS★");
  });

  it("primary予定 — 通常フィールド", async () => {
    const events = [
      baseEvent({
        calendarId: "primary",
        calendarSummary: "primary",
        location: "つくば市",
      }),
    ];
    const intel = await buildDayScheduleIntelligence("2026-06-18", events);
    assert.equal(intel.events[0].calendarSummary, "primary");
  });

  it("Maps API未設定 — Google Maps API未設定表示", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const intel = await buildDayScheduleIntelligence("2026-06-18", [
      baseEvent({ location: "守谷市" }),
    ]);
    assert.equal(intel.mapsApiConfigured, false);
    assert.equal(intel.events[0].travel.durationLabel, "Google Maps API未設定");
  });

  it("件名から案件を解決 — 材料チェック URL", async () => {
    const created = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "日程テスト",
        siteName: "防犯カメラ設置",
        address: "茨城県守谷市",
      });
    assert.equal(created.status, 201);
    const ref = resolveEventProjectRef(
      baseEvent({ title: "防犯カメラ設置", location: null, description: null })
    );
    assert.ok(ref);
    assert.equal(ref.projectSource, "survey");
    const intel = await buildDayScheduleIntelligence("2026-06-18", [
      baseEvent({ id: "mat-1", title: "防犯カメラ設置", location: "守谷市" }),
    ]);
    assert.ok(intel.events[0].fieldCheck?.url?.includes("/field-check-v1"));
    assert.ok(intel.events[0].fieldCheck?.url?.includes("projectId="));
  });

  it("天気API失敗時もモック天気で継続", async () => {
    process.env.OPEN_METEO_LIVE = "0";
    const intel = await buildDayScheduleIntelligence("2026-06-18", [
      baseEvent({ location: "守谷市" }),
    ]);
    assert.equal(intel.events[0].weatherSlots.length, 3);
    assert.ok(intel.events[0].weather?.source === "mock");
  });

  it("GET /api/schedule/daily-summary", async () => {
    const date = "2026-06-18";
    getDatabase()
      .prepare(
        `INSERT INTO schedule_calendar_events
         (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
         VALUES (?, ?, ?, ?, 'construction', 'google', '09:00', '12:00', 0, '守谷市', '', datetime('now'))`
      )
      .run("intel-ev-1", "ext-intel-1", date, "守谷市リフォーム");
    const res = await request(app)
      .get(`/api/schedule/daily-summary?date=${date}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.date, date);
    assert.ok(Array.isArray(res.body.events));
    assert.ok("feasibilityLabel" in res.body);
    assert.ok("totalTravelMin" in res.body);
  });

  it("GET /api/schedule/v1/daily-summary エイリアス", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/daily-summary?date=2026-06-18")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.date, "2026-06-18");
  });

  it("通常出発地 settings PATCH/GET", async () => {
    const saved = await request(app)
      .patch("/api/schedule/v1/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ defaultOrigin: "茨城県守谷市本町1-2-3" });
    assert.equal(saved.status, 200);
    assert.ok(saved.body.defaultOrigin.includes("守谷市"));
    assert.ok(saved.body.defaultOriginDisplay.includes("守谷市"));
    const loaded = await request(app)
      .get("/api/schedule/v1/settings")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.defaultOrigin, saved.body.defaultOrigin);
  });

  it("デバッグ API", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/intelligence/debug?date=2026-06-18")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.mapsApiConfigured, "boolean");
    assert.ok(Array.isArray(res.body.addressExtractions));
    assert.ok(Array.isArray(res.body.routeResults));
  });

  it("日詳細 API に intelligence が含まれる", async () => {
    const res = await request(app)
      .get("/api/schedule/v1/day?date=2026-06-18")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.intelligence);
    assert.ok(Array.isArray(res.body.intelligence.events));
  });

  it("buildDailySummaryResponse 形式", async () => {
    updateSchedulePlannerSettingsV1({ defaultOrigin: "守谷市" });
    const summary = buildDailySummaryResponse(
      await buildDayScheduleIntelligence("2026-06-18", [
        baseEvent({ location: "柏市", startTime: "10:00", endTime: "11:00" }),
      ])
    );
    assert.equal(summary.date, "2026-06-18");
    assert.ok(summary.events[0].weather.length === 3);
    assert.ok(summary.events[0].travel.mapsUrl == null || summary.events[0].travel.mapsUrl.includes("google.com"));
    assert.equal(summary.events[0].travel.compactLabel, "🏠→現場");
  });

  it("schedule-intelligence-ui.js — 実務モード（時刻・天気・所要時間・材料チェック）", async () => {
    const js = await request(app).get("/js/schedule-intelligence-ui.js");
    assert.equal(js.status, 200);
    assert.ok(js.text.includes("schedule-intel-travel"));
    assert.ok(js.text.includes("🏠→現場"));
    assert.ok(js.text.includes("schedule-intel-material"));
    assert.ok(js.text.includes("btn-sub btn-small schedule-intel-material"));
    assert.ok(js.text.includes("schedule-intel-practical"));
    assert.ok(js.text.includes("schedule-intel-travel-muted"));
    assert.ok(js.text.includes("\\u79fb\\u52d5\\u6642\\u9593\\u672a\\u8a08\\u7b97"));
    assert.ok(!js.text.includes("schedule-intel-details"));
    assert.ok(!js.text.includes("eventCalendarBadgeHtml"));
  });

  it("none キャッシュ — API キー設定後は Directions を再試行", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-directions-key";
    const { setCachedRouteDuration } = await import("../src/schedule/maps-route-cache.js");
    const { fetchDrivingDurationMinForIntelligence } = await import(
      "../src/schedule/google-maps-service.js"
    );
    const origin = "茨城県つくばみらい市板橋2889-2";
    const dest = "茨城県守谷市百合丘2丁目2633-1";
    const date = "2026-06-20";
    setCachedRouteDuration(origin, dest, date, null, "none");

    const originalFetch = globalThis.fetch;
    let directionCalls = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("directions/json")) {
        directionCalls += 1;
        return new Response(
          JSON.stringify({
            status: "OK",
            routes: [{ legs: [{ duration: { value: 2700 } }] }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await fetchDrivingDurationMinForIntelligence(origin, dest, date);
      assert.equal(result.source, "api");
      assert.equal(result.minutes, 45);
      assert.equal(result.cacheHit, false);
      assert.ok(directionCalls >= 1);

      setCachedRouteDuration(origin, dest, date, null, "none");
      const retry = await fetchDrivingDurationMinForIntelligence(origin, dest, date);
      assert.equal(retry.source, "api");
      assert.equal(retry.minutes, 45);
      assert.equal(retry.cacheHit, false);
      assert.ok(directionCalls >= 2);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GOOGLE_MAPS_API_KEY;
    }
  });
});
