import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { buildPracticalHubCards } from "../src/pwa/pwa-hub.js";
import { CUSTOMER_HOME_CARDS_V1 } from "../src/shared/customer/customer-labels-v1.js";
import { buildCustomerHomeStateV1 } from "../src/shared/customer/customer-home-state-v1.js";
import {
  GAS_MONITOR_PROPERTIES_V1,
  needsDeliveryV1,
  cylinderPercentV1,
} from "../src/gas-monitor/gas-monitor-sites-v1.js";
import {
  GAS_MONITOR_BUILDINGS_V1,
} from "../src/gas-monitor/gas-monitor-buildings-v1.js";
import {
  buildLifeCareOverlayV1,
  resolveLifeCareStatusV1,
} from "../src/gas-monitor/gas-monitor-life-care-v1.js";
import {
  buildGasCustomerDashboardV1,
  buildGasOperatorDashboardV1,
} from "../src/gas-monitor/gas-monitor-dashboard-v1.js";
import {
  TISLY_CUSTOMER_RESERVED_SEGMENTS,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_INTERNAL_ROUTES_V1,
} from "../src/shared/routes/tisly-routes-v1.js";

const app = createApp();

describe("gas-monitor-v1", () => {
  it("appends mock properties without shrinking catalog", () => {
    assert.ok(GAS_MONITOR_PROPERTIES_V1.length >= 5);
    const kinds = new Set(GAS_MONITOR_PROPERTIES_V1.map((p) => p.kind));
    assert.ok(kinds.has("detached"));
    assert.ok(kinds.has("apartment"));
    assert.ok(kinds.has("shop"));
    assert.ok(
      GAS_MONITOR_PROPERTIES_V1.some((p) => p.countryCode === "AU")
    );
    assert.ok(
      GAS_MONITOR_PROPERTIES_V1.every(
        (p) => p.tenantId && p.currency && p.cylinders.length === 2
      )
    );
  });

  it("flags low cylinder or auto-switch as delivery needed", () => {
    const apt = GAS_MONITOR_PROPERTIES_V1.find(
      (p) => p.id === "GAS-JP-APT-201"
    );
    assert.ok(apt);
    assert.equal(needsDeliveryV1(apt), true);
    const low = apt.cylinders.find((c) => c.index === 1);
    assert.ok(cylinderPercentV1(low) <= 20);

    const shop = GAS_MONITOR_PROPERTIES_V1.find(
      (p) => p.id === "GAS-JP-SHOP-001"
    );
    assert.ok(shop);
    assert.equal(needsDeliveryV1(shop), true);
  });

  it("does not expose mock properties in customer dashboard", () => {
    assert.equal(
      buildGasCustomerDashboardV1("GAS-JP-HOME-001"),
      null
    );
    assert.equal(
      buildGasCustomerDashboardV1("GAS-JP-HOME-ALERT"),
      null
    );
  });

  it("counts only registered live properties", () => {
    const dash = buildGasOperatorDashboardV1();
    assert.equal(dash.totalProperties, dash.properties.length);
    assert.equal(
      dash.buildings.reduce(
        (count, building) => count + building.totalRooms,
        0
      ),
      dash.totalProperties
    );
    assert.ok(
      dash.properties.every(
        (property) => !property.propertyId.startsWith("GAS-")
      )
    );
  });

  it("appends gas card to hub and customer home without removing eco_water", async () => {
    const cards = buildPracticalHubCards("surveyor");
    const gas = cards.find((c) => c.id === "gas_monitor_v1");
    assert.ok(gas);
    assert.equal(gas.url, "/gas-monitor-v1");
    assert.ok(cards.some((c) => c.id === "eco_water_v1"));

    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "eco_water"));
    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "gas_monitor"));
    assert.ok(CUSTOMER_HOME_CARDS_V1.length >= 8);

    const home = buildCustomerHomeStateV1({
      shareId: "demo-share",
      propertyName: "デモ物件",
    });
    const homeGas = home.cards.find((c) => c.id === "gas_monitor");
    assert.equal(homeGas?.href, "/customer/gas-monitor");
  });

  it("registers routes and reserved segment", () => {
    assert.ok(
      TISLY_INTERNAL_ROUTES_V1.some((r) => r.path === "/gas-monitor-v1")
    );
    assert.ok(
      TISLY_CUSTOMER_ROUTES_V1.some(
        (r) => r.path === "/customer/gas-monitor"
      )
    );
    assert.ok(TISLY_CUSTOMER_RESERVED_SEGMENTS.has("gas-monitor"));
  });

  it("serves customer and operator pages and APIs", async () => {
    const pages = [
      "/customer/gas-monitor",
      "/gas-monitor-v1",
      "/app/gas-monitor",
    ];
    for (const p of pages) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
      assert.ok(
        String(res.text).includes("gas-monitor"),
        `body should mention gas-monitor: ${p}`
      );
    }

    const cust = await request(app).get(
      "/api/gas-monitor/v1/customer?propertyId=GAS-JP-HOME-001"
    );
    assert.equal(cust.status, 200);
    assert.equal(cust.body.ok, true);
    assert.equal(cust.body.empty, true);
    assert.equal(cust.body.dashboard, null);

    const op = await request(app).get("/api/gas-monitor/v1/operator");
    assert.equal(op.status, 200);
    assert.equal(op.body.ok, true);
    assert.ok(
      op.body.dashboard.properties.every(
        (property: { propertyId: string }) =>
          !property.propertyId.startsWith("GAS-")
      )
    );
  });

  // --- Life Care / 建物グループ拡張（追記） ---

  it("keeps original 6 seed properties and appends rooms", () => {
    const ids = GAS_MONITOR_PROPERTIES_V1.map((p) => p.id);
    for (const id of [
      "GAS-JP-HOME-001",
      "GAS-JP-APT-201",
      "GAS-JP-APT-305",
      "GAS-JP-SHOP-001",
      "GAS-JP-HOME-ALERT",
      "GAS-AU-HOME-001",
    ]) {
      assert.ok(ids.includes(id), `missing seed ${id}`);
    }
    assert.ok(ids.includes("GAS-JP-APT-102"));
    assert.ok(ids.includes("GAS-JP-APT-403"));
    assert.ok(ids.includes("GAS-AU-APT-12A"));
    assert.ok(GAS_MONITOR_PROPERTIES_V1.length >= 10);
  });

  it("groups Tsukuba apartments under one building", () => {
    const corpo = GAS_MONITOR_BUILDINGS_V1.find(
      (b) => b.buildingId === "BLD-JP-TSUKUBA-CORPO"
    );
    assert.ok(corpo);
    assert.equal(corpo.buildingName, "つくばコーポ");
    assert.ok(corpo.propertyIds.includes("GAS-JP-APT-201"));
    assert.ok(corpo.propertyIds.includes("GAS-JP-APT-403"));
    assert.ok(corpo.propertyIds.length >= 4);
  });

  it("exposes JP/AU currency on AU apartment building", () => {
    const melb = GAS_MONITOR_BUILDINGS_V1.find(
      (b) => b.buildingId === "BLD-AU-MELBOURNE-APT"
    );
    assert.ok(melb);
    assert.equal(melb.countryCode, "AU");
    assert.equal(melb.currency, "AUD");
  });

  it("resolves life care badges including bath dwell and quake", () => {
    assert.equal(
      resolveLifeCareStatusV1("GAS-JP-APT-201", false),
      "no_gas_24h"
    );
    assert.equal(
      resolveLifeCareStatusV1("GAS-JP-APT-403", false),
      "bath_toilet_long"
    );
    const quake = buildLifeCareOverlayV1(
      "GAS-JP-HOME-ALERT",
      true
    );
    assert.equal(quake.status, "quake_shutoff");
    assert.equal(quake.alertLevel, "critical");
    assert.equal(quake.statusEmoji, "🚨");
  });

  it("operator dashboard excludes all demo building groups", () => {
    const dash = buildGasOperatorDashboardV1();
    assert.ok(
      dash.buildings.every(
        (building) =>
          building.buildingId.startsWith("BLD-ORPHAN-") &&
          building.totalRooms === 1
      )
    );
    assert.ok(
      dash.buildings.every(
        (building) =>
          building.buildingName !== "つくばコーポ" &&
          !building.buildingName.includes("Melbourne Harbour")
      )
    );
  });

  it("serves buildings API and operator HTML with accordion hooks", async () => {
    const bld = await request(app).get(
      "/api/gas-monitor/v1/buildings"
    );
    assert.equal(bld.status, 200);
    assert.equal(bld.body.ok, true);
    assert.ok(
      bld.body.buildings.every(
        (building: { buildingName: string }) =>
          building.buildingName !== "つくばコーポ"
      )
    );

    const page = await request(app).get("/gas-monitor-v1");
    assert.equal(page.status, 200);
    assert.ok(String(page.text).includes("gm-sum-lifecare"));
    assert.ok(String(page.text).includes("建物グループ"));
    assert.match(page.text, /➕ 新規物件を追加/);
    assert.match(page.text, /id="gm-register-dialog"/);
    assert.match(page.text, /id="gm-register-form"/);
    assert.match(page.text, /初期指針値（m³）/);

    const custPage = await request(app).get(
      "/customer/gas-monitor"
    );
    assert.equal(custPage.status, 200);
    assert.ok(String(custPage.text).includes("Life Care"));
    assert.ok(
      String(custPage.text).includes(
        "登録されている物件はありません"
      )
    );
    assert.match(custPage.text, /＋ 機器を新規登録する/);
    assert.match(custPage.text, /href="\/device-binding-v1"/);

    const operatorJs = await request(app).get(
      "/js/features/gas-monitor/gas-monitor-operator-v1.js"
    );
    assert.match(operatorJs.text, /＋ 機器を新規登録する/);
    assert.match(operatorJs.text, /テストパルス\+1送信/);
    assert.match(operatorJs.text, /\/api\/meter\/telemetry/);
    assert.match(operatorJs.text, /実機オンライン/);
    assert.match(operatorJs.text, /\/api\/device\/unbind/);
    assert.match(operatorJs.text, /\/api\/device\/register/);
    assert.match(operatorJs.text, /\/api\/device\/next-id/);
    assert.match(operatorJs.text, /data-select-property/);
    assert.match(operatorJs.text, /selectedPropertyId/);
    assert.match(operatorJs.text, /data-delete-property/);
    assert.match(operatorJs.text, /監視データも消去されます/);

    const customerJs = await request(app).get(
      "/js/features/gas-monitor/gas-monitor-customer-v1.js"
    );
    assert.match(customerJs.text, /\/api\/device\/unbind/);
    assert.match(customerJs.text, /deleteSelectedProperty/);
    assert.match(custPage.text, /id="gm-property-count"/);
    assert.match(custPage.text, /id="gm-delete-property"/);

    const css = await request(app).get(
      "/css/features/gas-monitor/gas-monitor-v1.css"
    );
    assert.match(css.text, /\.gm-register-button/);
    assert.match(css.text, /\.gm-add-property-button/);
    assert.match(css.text, /\.gm-register-dialog/);
    assert.match(css.text, /\.gm-delete-property-button/);
    assert.match(css.text, /min-height: 52px/);
  });

  it("keeps accordion open state across 3s polling", async () => {
    const stateJs = await request(app).get(
      "/js/features/gas-monitor/gas-monitor-accordion-state-v1.js"
    );
    assert.equal(stateJs.status, 200);
    // 開いている物件IDを Set で保持
    assert.match(stateJs.text, /openPropertyIds = new Set/);
    assert.match(stateJs.text, /\[data-accordion-id\]/);
    // 開閉はクラスとインラインstyleで制御
    assert.match(stateJs.text, /EXPANDED_CLASS = "is-expanded"/);
    assert.match(stateJs.text, /style\.display = next/);
    // ユーザー操作のみで開閉する
    assert.match(stateJs.text, /"click"/);
    assert.ok(!/"toggle"/.test(stateJs.text));

    const operatorJs = await request(app).get(
      "/js/features/gas-monitor/gas-monitor-operator-v1.js"
    );
    assert.match(
      operatorJs.text,
      /gas-monitor-accordion-state-v1\.js/
    );
    assert.match(operatorJs.text, /data-accordion-id=/);
    assert.match(operatorJs.text, /data-accordion-toggle/);
    // ポーリング時は差分更新（全消去しない）
    assert.match(operatorJs.text, /function patchBuildingCard/);
    assert.match(operatorJs.text, /function patchRoomCard/);
    assert.match(operatorJs.text, /function syncKeyedChildren/);
    assert.match(operatorJs.text, /accordion\.restore/);
    // 差分テキスト更新のフック
    assert.match(operatorJs.text, /pulse-count-text/);
    assert.match(operatorJs.text, /meter-value-text/);
    assert.match(operatorJs.text, /status-badge/);
    // details と一括再描画は廃止
    assert.ok(!/<details/.test(operatorJs.text));
    assert.ok(!/root\.innerHTML/.test(operatorJs.text));
    assert.ok(!/roomsEl\.innerHTML/.test(operatorJs.text));

    const customerJs = await request(app).get(
      "/js/features/gas-monitor/gas-monitor-customer-v1.js"
    );
    assert.match(
      customerJs.text,
      /gas-monitor-accordion-state-v1\.js/
    );
    // グラフは destroy せず数値のみ更新
    assert.ok(!/usageChart\.destroy\(\)/.test(customerJs.text));
    assert.match(customerJs.text, /usageChart\.update\("none"\)/);
    assert.match(customerJs.text, /accordion\.restore/);
    assert.match(customerJs.text, /function syncKeyedChildren/);
    assert.match(customerJs.text, /meter-value-text/);
    // 一覧の innerHTML 再代入は廃止
    assert.ok(!/select\.innerHTML/.test(customerJs.text));
    assert.ok(!/setHtmlCached/.test(customerJs.text));

    const css = await request(app).get(
      "/css/features/gas-monitor/gas-monitor-v1.css"
    );
    assert.match(
      css.text,
      /\.gm-building-card\.is-expanded \.gm-building-chevron/
    );

    const sw = await request(app).get("/service-worker.js");
    assert.match(
      sw.text,
      /gas-monitor-accordion-state-v1\.js/
    );
    // SW は機能追加ごとに更新される（旧タグも許容）
    assert.match(
      sw.text,
      /tisly-pwa-v2457-tisly-home|tisly-pwa-v2456-property-register/
    );
    // 旧JSがHTTPキャッシュから返らないようにする
    assert.match(sw.text, /function shouldBypassHttpCache/);
    assert.match(sw.text, /cache: "reload"/);

    // HTML 側もバージョン付きで即時適用
    const operatorPage = await request(app).get("/app/gas-monitor");
    assert.match(
      operatorPage.text,
      /gas-monitor-operator-v1\.js\?v=2456/
    );
    const customerPage = await request(app).get(
      "/customer/gas-monitor"
    );
    assert.match(
      customerPage.text,
      /gas-monitor-customer-v1\.js\?v=2455/
    );
    assert.match(customerPage.text, /gm-device-online/);
  });
});
