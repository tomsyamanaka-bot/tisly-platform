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

  it("builds customer dashboard with big status fields", () => {
    const normal = buildGasCustomerDashboardV1("GAS-JP-HOME-001");
    assert.equal(normal.status, "normal");
    assert.equal(normal.statusEmoji, "🟢");
    assert.equal(normal.statusLabel, "正常稼働中");
    assert.ok(normal.todayUsageM3 > 0);
    assert.equal(normal.hourlyUsageM3.length, 24);
    assert.ok(normal.lifeWatchNotes.length >= 1);

    const emergency = buildGasCustomerDashboardV1("GAS-JP-HOME-ALERT");
    assert.equal(emergency.status, "emergency");
    assert.equal(emergency.statusEmoji, "🔴");
    assert.equal(emergency.statusLabel, "緊急遮断");
  });

  it("sorts operator dashboard with delivery and emergency first", () => {
    const dash = buildGasOperatorDashboardV1();
    assert.ok(dash.totalProperties >= 5);
    assert.ok(dash.deliveryAlertCount >= 1);
    assert.ok(dash.emergencyCount >= 1);
    assert.equal(dash.properties[0].emergencyShutoff, true);
    const firstNonEmergency = dash.properties.find((p) => !p.emergencyShutoff);
    assert.ok(firstNonEmergency?.needsDelivery);
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
    assert.equal(cust.body.dashboard.status, "normal");

    const op = await request(app).get("/api/gas-monitor/v1/operator");
    assert.equal(op.status, 200);
    assert.equal(op.body.ok, true);
    assert.ok(op.body.dashboard.properties.length >= 5);
  });
});
