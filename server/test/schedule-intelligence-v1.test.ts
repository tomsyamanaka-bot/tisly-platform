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
  TRAVEL_FETCH_FAILED_LABEL,
} = await import("../src/schedule/schedule-intelligence-service.js");
const { updateSchedulePlannerSettingsV1 } = await import("../src/schedule/schedule-settings-store.js");
import type { ScheduleEvent } from "../src/schedule/schedule-types.js";
import { resolveEventProjectRef } from "../src/schedule/address-extract-service.js";
const { upsertEventAddressOverride } = await import(
  "../src/schedule/schedule-event-address-overrides-store.js"
);

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

  it("description — 作業場所ラベルから住所抽出", () => {
    const addr = extractEventAddress(
      baseEvent({
        location: null,
        description: "作業場所: 茨城県つくば市研究学園5-1-1",
      })
    );
    assert.equal(addr.source, "description");
    assert.ok(addr.fullAddress?.includes("つくば市"));
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

  it("件名のみ地名 — 住所未確定（移動時間は計算しない）", async () => {
    const addr = extractEventAddress(
      baseEvent({ title: "柏市カメラ", location: null, description: null })
    );
    assert.equal(addr.source, "title_place");
    assert.equal(addr.displayAddress, "住所未確定");
    assert.equal(addr.cityHint, "柏市");
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const intel = await buildDayScheduleIntelligence("2026-06-18", [
      baseEvent({ id: "title-only", title: "柏市カメラ", location: null }),
    ]);
    assert.equal(intel.events[0].travel.durationLabel, "住所未設定");
    assert.equal(intel.events[0].travel.destination, null);
    delete process.env.GOOGLE_MAPS_API_KEY;
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
    assert.ok(Array.isArray(res.body.events));
    assert.ok(Array.isArray(res.body.addressExtractions));
    assert.ok(Array.isArray(res.body.routeResults));
    if (res.body.events.length) {
      const row = res.body.events[0];
      assert.ok("title" in row);
      assert.ok("calendarLocation" in row);
      assert.ok("extractedAddress" in row);
      assert.ok("addressSource" in row);
      assert.ok("routeOrigin" in row);
      assert.ok("routeDestination" in row);
      assert.ok("durationMin" in row);
      assert.ok("routeSource" in row);
      assert.ok("reason" in row);
    }
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
    assert.ok(js.text.includes("schedule-intel-address-btn"));
    assert.ok(js.text.includes("\\u4f4f\\u6240\\u672a\\u8a2d\\u5b9a"));
    assert.ok(js.text.includes("\\u79fb\\u52d5\\u6642\\u9593\\u672a\\u8a08\\u7b97"));
    assert.ok(js.text.includes("\\u79fb\\u52d5\\u6642\\u9593\\u53d6\\u5f97\\u5931\\u6557"));
    assert.ok(js.text.includes("renderWeekIntelligenceEventItemHtml"));
    assert.ok(js.text.includes("enrichIntelligenceWithDeparture"));
    assert.ok(!js.text.includes("schedule-intel-details"));
    assert.ok(!js.text.includes("eventCalendarBadgeHtml"));
  });

  it("none キャッシュ — API キー設定後は Directions を再試行", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-directions-key";
    const { fetchDrivingDurationMinForIntelligence } = await import(
      "../src/schedule/google-maps-service.js"
    );
    const origin = "茨城県つくばみらい市板橋2889-2";
    const dest = "茨城県守谷市百合丘2丁目2633-1";
    const date = "2026-06-20";
    const cacheKey = `${origin}\0${dest}\0${date}`;
    const { createHash } = await import("node:crypto");
    const key = createHash("sha256").update(cacheKey).digest("hex");
    getDatabase()
      .prepare(
        `INSERT INTO schedule_route_cache
         (cache_key, origin, destination, route_date, duration_min, duration_source, cached_at)
         VALUES (?, ?, ?, ?, NULL, 'none', datetime('now'))`
      )
      .run(key, origin, dest, date);

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

      getDatabase()
        .prepare(
          `INSERT INTO schedule_route_cache
           (cache_key, origin, destination, route_date, duration_min, duration_source, cached_at)
           VALUES (?, ?, ?, ?, NULL, 'none', datetime('now'))
           ON CONFLICT(cache_key) DO UPDATE SET duration_min = NULL, duration_source = 'none'`
        )
        .run(key, origin, dest, date);
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

  it("案件マスタ住所 — project source", () => {
    getDatabase()
      .prepare(
        `INSERT INTO survey_projects (project_id, customer_code, customer_name, site_name, address, status, survey_date, created_at, updated_at)
         VALUES ('proj-addr-1', 'TOMS001', 'テスト', '現場A', '茨城県取手市', 'active', '2026-06-18', datetime('now'), datetime('now'))`
      )
      .run();
    const addr = extractEventAddress(
      baseEvent({ title: "現場A", location: null, description: null })
    );
    assert.equal(addr.source, "project");
    assert.ok(addr.fullAddress?.includes("取手市"));
  });

  it("TiSLY 住所補正 — correction source", async () => {
    const saved = await request(app)
      .patch("/api/schedule/v1/events/ev-correct-only/address")
      .set("Authorization", `Bearer ${token}`)
      .send({ address: "茨城県龍ケ崎市若柴町1-1" });
    assert.equal(saved.status, 200);
    const addr = extractEventAddress(
      baseEvent({
        id: "ev-correct-only",
        title: "ユニーク補正テストXYZ",
        location: null,
        description: null,
      })
    );
    assert.equal(addr.source, "correction");
    assert.ok(addr.fullAddress?.includes("龍ケ崎市"));
  });

  it("住所なし — 住所未設定ラベル（Maps API 設定時）", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const intel = await buildDayScheduleIntelligence("2026-06-18", [
      baseEvent({ id: "no-addr", title: "打合せ", location: null, description: null }),
    ]);
    assert.equal(intel.events[0].travel.durationLabel, "住所未設定");
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("同一住所 — 自宅と現場①が同じなら 0 分（API）", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    updateSchedulePlannerSettingsV1({ defaultOrigin: "茨城県つくばみらい市板橋2889-2" });
    upsertEventAddressOverride("ev-same-home", "つくばみらい市板橋2889-2");
    const intel = await buildDayScheduleIntelligence("2026-06-14", [
      baseEvent({
        id: "ev-same-home",
        title: "材料発注",
        location: null,
        description: null,
      }),
    ]);
    assert.equal(intel.events[0].travel.durationMin, 0);
    assert.equal(intel.events[0].travel.durationLabel, "0分（API）");
    assert.equal(intel.events[0].travel.durationSource, "api");
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("件名トークン — プレフィックス除去後に案件解決", async () => {
    getDatabase()
      .prepare(
        `INSERT INTO survey_projects (project_id, customer_code, customer_name, site_name, address, status, survey_date, created_at, updated_at)
         VALUES ('proj-token-1', 'TOMS001', 'TS生コン', '溶接機ケーブル', '茨城県', 'active', '2026-06-14', datetime('now'), datetime('now'))`
      )
      .run();
    const ref = resolveEventProjectRef(
      baseEvent({
        title: "現調)TS生コン　溶接機ケーブル　金持って行く！",
        location: null,
        description: null,
      })
    );
    assert.ok(ref);
    assert.equal(ref.projectId, "proj-token-1");
  });

  it("Maps API設定済みで取得失敗 — 移動時間取得失敗ラベル", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-directions-fail-key";
    updateSchedulePlannerSettingsV1({ defaultOrigin: "茨城県つくばみらい市板橋2889-2" });
    const origin = "茨城県つくばみらい市板橋2889-2";
    const dest = "茨城県守谷市百合丘2丁目2633-1";
    const date = "2026-06-19";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("directions/json")) {
        return new Response(JSON.stringify({ status: "ZERO_RESULTS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input);
    };
    try {
      const intel = await buildDayScheduleIntelligence(date, [
        baseEvent({ id: "fail-ev", location: dest, startTime: "10:00", endTime: "11:00" }),
      ]);
      assert.equal(intel.mapsApiConfigured, true);
      assert.equal(intel.events[0].travel.durationLabel, TRAVEL_FETCH_FAILED_LABEL);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GOOGLE_MAPS_API_KEY;
    }
  });

  it("schedule-v1.js — 週間一覧で intelligence 表示", async () => {
    const js = await request(app).get("/js/schedule-v1.js");
    assert.equal(js.status, 200);
    assert.ok(js.text.includes("renderWeekIntelligenceEventItemHtml"));
    assert.ok(js.text.includes("bindIntelligenceEventCards"));
    assert.ok(js.text.includes("schedule-intel-material"));
  });
});
