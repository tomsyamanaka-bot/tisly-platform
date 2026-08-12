import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { buildPracticalHubCards } from "../src/pwa/pwa-hub.js";
import { CUSTOMER_HOME_CARDS_V1 } from "../src/shared/customer/customer-labels-v1.js";
import { buildCustomerHomeStateV1 } from "../src/shared/customer/customer-home-state-v1.js";
import {
  DEMAND_SECURITY_SITES_V1,
  demandUsagePercentV1,
  securityNeedsAttentionV1,
  setDemandRelayStateV1,
} from "../src/demand-security/demand-security-sites-v1.js";
import {
  buildDemandCustomerDashboardV1,
  buildDemandOperatorDashboardV1,
} from "../src/demand-security/demand-security-dashboard-v1.js";
import {
  TISLY_CUSTOMER_RESERVED_SEGMENTS,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_INTERNAL_ROUTES_V1,
} from "../src/shared/routes/tisly-routes-v1.js";

const app = createApp();

describe("demand-security-v1", () => {
  it("appends JP/AU mock sites without shrinking catalog", () => {
    assert.ok(DEMAND_SECURITY_SITES_V1.length >= 5);
    assert.ok(
      DEMAND_SECURITY_SITES_V1.some((s) => s.countryCode === "JP")
    );
    assert.ok(
      DEMAND_SECURITY_SITES_V1.some((s) => s.countryCode === "AU")
    );
    assert.ok(
      DEMAND_SECURITY_SITES_V1.every(
        (s) =>
          s.tenantId &&
          s.currency &&
          s.relays.length >= 1 &&
          s.hourlyCurrentA.length === 24
      )
    );
  });

  it("computes demand percent and security attention", () => {
    const shop = DEMAND_SECURITY_SITES_V1.find(
      (s) => s.id === "DEMAND-JP-SHOP-001"
    );
    assert.ok(shop);
    assert.equal(shop.peakCutActive, true);
    assert.ok(demandUsagePercentV1(shop) > 50);
    assert.equal(securityNeedsAttentionV1(shop), true);

    const alert = DEMAND_SECURITY_SITES_V1.find(
      (s) => s.id === "DEMAND-JP-HOME-ALERT"
    );
    assert.ok(alert);
    assert.equal(securityNeedsAttentionV1(alert), true);
  });

  it("builds customer dashboard status fields", () => {
    const normal = buildDemandCustomerDashboardV1(
      "DEMAND-JP-HOME-001"
    );
    assert.equal(normal.status, "normal");
    assert.equal(normal.statusEmoji, "🟢");
    assert.ok(normal.mainCurrentA > 0);
    assert.equal(normal.hourlyCurrentA.length, 24);

    const peak = buildDemandCustomerDashboardV1(
      "DEMAND-JP-FACTORY-001"
    );
    assert.equal(peak.status, "peak_cut");
    assert.equal(peak.peakCutActive, true);

    const sec = buildDemandCustomerDashboardV1(
      "DEMAND-JP-HOME-ALERT"
    );
    assert.equal(sec.status, "security_alert");
  });

  it("sorts operator dashboard with security and peak first", () => {
    const dash = buildDemandOperatorDashboardV1();
    assert.ok(dash.totalSites >= 5);
    assert.ok(dash.peakCutCount >= 1);
    assert.ok(dash.securityAlertCount >= 1);
    assert.equal(dash.sites[0].securityAttention, true);
  });

  it("toggles relay without removing other channels", () => {
    const before = DEMAND_SECURITY_SITES_V1.find(
      (s) => s.id === "DEMAND-JP-HOME-001"
    );
    assert.ok(before);
    const relayCount = before.relays.length;
    const target = before.relays[0];
    const prev = target.on;
    const updated = setDemandRelayStateV1(
      "DEMAND-JP-HOME-001",
      target.id,
      !prev
    );
    assert.ok(updated);
    assert.equal(updated.relays.length, relayCount);
    assert.equal(
      updated.relays.find((r) => r.id === target.id)?.on,
      !prev
    );
    // 戻す（既存状態を保護）
    setDemandRelayStateV1(
      "DEMAND-JP-HOME-001",
      target.id,
      prev
    );
  });

  it("appends cards without removing eco_water or gas_monitor", () => {
    const cards = buildPracticalHubCards("surveyor");
    assert.ok(cards.some((c) => c.id === "eco_water_v1"));
    assert.ok(cards.some((c) => c.id === "gas_monitor_v1"));
    const demand = cards.find((c) => c.id === "demand_security_v1");
    assert.ok(demand);
    assert.equal(demand.url, "/demand-security-v1");

    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "eco_water"));
    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "gas_monitor"));
    assert.ok(
      CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "demand_security")
    );
    assert.ok(CUSTOMER_HOME_CARDS_V1.length >= 9);

    const home = buildCustomerHomeStateV1({
      shareId: "demo-share",
      propertyName: "デモ物件",
    });
    const homeDemand = home.cards.find(
      (c) => c.id === "demand_security"
    );
    assert.equal(homeDemand?.href, "/customer/demand-security");
  });

  it("registers routes and reserved segment", () => {
    assert.ok(
      TISLY_INTERNAL_ROUTES_V1.some(
        (r) => r.path === "/demand-security-v1"
      )
    );
    assert.ok(
      TISLY_CUSTOMER_ROUTES_V1.some(
        (r) => r.path === "/customer/demand-security"
      )
    );
    assert.ok(
      TISLY_CUSTOMER_RESERVED_SEGMENTS.has("demand-security")
    );
  });

  it("serves pages and APIs", async () => {
    const pages = [
      "/customer/demand-security",
      "/demand-security-v1",
      "/app/demand-security",
    ];
    for (const p of pages) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
    }

    const customer = await request(app).get(
      "/api/demand-security/v1/customer?siteId=DEMAND-JP-HOME-001"
    );
    assert.equal(customer.status, 200);
    assert.equal(customer.body.ok, true);
    assert.equal(
      customer.body.dashboard.siteId,
      "DEMAND-JP-HOME-001"
    );

    const operator = await request(app).get(
      "/api/demand-security/v1/operator"
    );
    assert.equal(operator.status, 200);
    assert.ok(operator.body.dashboard.totalSites >= 5);

    const relay = await request(app)
      .post("/api/demand-security/v1/relay")
      .send({
        siteId: "DEMAND-JP-HOME-001",
        relayId: "r2",
        on: true,
      });
    assert.equal(relay.status, 200);
    assert.equal(relay.body.ok, true);
    assert.equal(relay.body.relay.on, true);
    // 元に戻す
    await request(app)
      .post("/api/demand-security/v1/relay")
      .send({
        siteId: "DEMAND-JP-HOME-001",
        relayId: "r2",
        on: false,
      });
  });
});
