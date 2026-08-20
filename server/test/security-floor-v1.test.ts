import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { buildPracticalHubCards } from "../src/pwa/pwa-hub.js";
import { CUSTOMER_HOME_CARDS_V1 } from "../src/shared/customer/customer-labels-v1.js";
import { buildCustomerHomeStateV1 } from "../src/shared/customer/customer-home-state-v1.js";
import {
  SECURITY_FLOOR_SITES_V1,
  securitySiteHasAlertV1,
  setSecurityGuardModeV1,
  setSecuritySensorStateV1,
} from "../src/security-floor/security-floor-sites-v1.js";
import {
  buildSecurityFloorCustomerDashboardV1,
  buildSecurityFloorOperatorDashboardV1,
} from "../src/security-floor/security-floor-dashboard-v1.js";
import {
  TISLY_CUSTOMER_RESERVED_SEGMENTS,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_INTERNAL_ROUTES_V1,
} from "../src/shared/routes/tisly-routes-v1.js";

const app = createApp();
const publicDir = path.resolve("public");

describe("security-floor-v1", () => {
  it("appends JP/AU floor sites without shrinking catalog", () => {
    assert.ok(SECURITY_FLOOR_SITES_V1.length >= 3);
    const jp = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-JP-TSUKUBA-001"
    );
    const au = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-AU-SYDNEY-001"
    );
    const moriya = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-JP-MORIYA-001"
    );
    assert.ok(jp);
    assert.ok(au);
    assert.ok(moriya);
    assert.equal(moriya.addressLabel.includes("守谷"), true);
    assert.ok(jp.floors.find((f) => f.id === "roof"));
    assert.equal(
      jp.floors.find((f) => f.id === "roof")?.enabled,
      false
    );
    assert.ok(jp.sensors.some((s) => s.kind === "camera"));
    assert.ok(moriya.sensors.some((s) => s.kind === "camera"));
    assert.equal(jp.countryCode, "JP");
    assert.equal(au.countryCode, "AU");
    assert.equal(jp.currency, "JPY");
    assert.equal(au.currency, "AUD");
    assert.ok(
      jp.floors.find((f) => f.id === "2f")?.enabled
    );
    assert.equal(
      au.floors.find((f) => f.id === "2f")?.enabled,
      false
    );
    for (const kind of [
      "lock",
      "door",
      "mmwave",
      "gas",
      "panel",
    ]) {
      assert.ok(jp.sensors.some((s) => s.kind === kind));
      assert.ok(au.sensors.some((s) => s.kind === kind));
    }
  });

  it("pulses living alert unless disarmed", () => {
    const jp = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-JP-TSUKUBA-001"
    );
    assert.ok(jp);
    const prevMode = jp.guardMode;
    setSecurityGuardModeV1(jp.id, "away");
    assert.equal(securitySiteHasAlertV1(jp), true);
    const dash = buildSecurityFloorCustomerDashboardV1(
      jp.id
    );
    assert.equal(dash.status, "alert");
    assert.ok(
      dash.rooms.some(
        (r) => r.id === "jp-1f-living" && r.alertVisible
      )
    );
    setSecurityGuardModeV1(jp.id, "disarmed");
    assert.equal(securitySiteHasAlertV1(jp), false);
    setSecurityGuardModeV1(jp.id, prevMode);
  });

  it("toggles sensor without removing other sensors", () => {
    const au = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-AU-SYDNEY-001"
    );
    assert.ok(au);
    const count = au.sensors.length;
    const target = au.sensors.find(
      (s) => s.kind === "mmwave"
    );
    assert.ok(target);
    const prev = target.state;
    const updated = setSecuritySensorStateV1(
      au.id,
      target.id,
      prev === "alert" ? "normal" : "alert"
    );
    assert.ok(updated);
    assert.equal(updated.sensors.length, count);
    setSecuritySensorStateV1(au.id, target.id, prev);
  });

  it("builds operator dashboard with plan fields", () => {
    const dash = buildSecurityFloorOperatorDashboardV1();
    assert.ok(dash.totalSites >= 2);
    assert.ok(
      dash.sites.every(
        (s) => s.tenantId && s.planCode && s.planStatus
      )
    );
  });

  it("appends hub and customer cards without removing home", () => {
    const cards = buildPracticalHubCards("surveyor");
    assert.ok(cards.some((c) => c.id === "tisly_home_v1"));
    const sec = cards.find(
      (c) => c.id === "security_floor_v1"
    );
    assert.ok(sec);
    assert.equal(sec.url, "/security-v1");
    assert.ok(
      CUSTOMER_HOME_CARDS_V1.some(
        (c) => c.id === "tisly_home"
      )
    );
    assert.ok(
      CUSTOMER_HOME_CARDS_V1.some(
        (c) => c.id === "home_security"
      )
    );
    const home = buildCustomerHomeStateV1({
      shareId: "demo-share",
      propertyName: "デモ物件",
    });
    const card = home.cards.find(
      (c) => c.id === "home_security"
    );
    assert.equal(card?.href, "/customer/security");
  });

  it("registers routes and reserved segment", () => {
    assert.ok(
      TISLY_INTERNAL_ROUTES_V1.some(
        (r) => r.path === "/security-v1"
      )
    );
    assert.ok(
      TISLY_CUSTOMER_ROUTES_V1.some(
        (r) => r.path === "/customer/security"
      )
    );
    assert.ok(TISLY_CUSTOMER_RESERVED_SEGMENTS.has("security"));
  });

  it("serves pages CSS keyframes and APIs", async () => {
    const pages = [
      "/customer/security",
      "/security-v1",
      "/app/security-v1",
      "/app/security",
    ];
    for (const p of pages) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
    }

    const css = fs.readFileSync(
      path.join(
        publicDir,
        "css/features/security/security-floor-v1.css"
      ),
      "utf8"
    );
    assert.match(css, /pulse-glow/);
    assert.match(css, /pulse-alarm/);
    assert.match(css, /#ef4444/i);
    assert.match(css, /#1e3a8a/i);
    assert.match(css, /#f8fafc/i);
    assert.match(css, /#2563eb/i);
    assert.match(css, /perspective:\s*1000px/);
    assert.match(css, /backface-visibility:\s*hidden/);
    assert.match(css, /transition:\s*transform\s+0\.35s\s+ease-out/);
    assert.match(css, /max-width:\s*360px/);
    assert.match(css, /height:\s*320px/);
    assert.match(css, /padding:\s*16px/);
    assert.match(css, /#ffffff/i);
    assert.match(css, /#1e293b/i);
    assert.match(css, /touch-action: pan-y/);
    assert.match(css, /display: none !important/);

    const customer = await request(app).get(
      "/api/security-floor/v1/customer?siteId=SEC-JP-TSUKUBA-001"
    );
    assert.equal(customer.status, 200);
    assert.equal(customer.body.ok, true);
    assert.equal(
      customer.body.dashboard.siteId,
      "SEC-JP-TSUKUBA-001"
    );

    const operator = await request(app).get(
      "/api/security-floor/v1/operator"
    );
    assert.equal(operator.status, 200);
    assert.ok(operator.body.dashboard.totalSites >= 3);

    const mode = await request(app)
      .post("/api/security-floor/v1/guard-mode")
      .send({
        siteId: "SEC-AU-SYDNEY-001",
        mode: "away",
      });
    assert.equal(mode.status, 200);
    assert.equal(mode.body.ok, true);
    await request(app)
      .post("/api/security-floor/v1/guard-mode")
      .send({
        siteId: "SEC-AU-SYDNEY-001",
        mode: "home",
      });

    const notify = await request(app)
      .post("/api/security-floor/v1/test-notify")
      .send({ siteId: "SEC-AU-SYDNEY-001" });
    assert.equal(notify.status, 200);
    assert.ok(notify.body.operatorSite.soc);
    assert.ok(
      Array.isArray(notify.body.operatorSite.soc.alarmLogs)
    );
    await request(app)
      .post("/api/security-floor/v1/test-notify")
      .send({ siteId: "SEC-AU-SYDNEY-001" });

    const light = await request(app)
      .post("/api/security-floor/v1/lighting")
      .send({ siteId: "SEC-JP-MORIYA-001", on: true });
    assert.equal(light.status, 200);
    assert.equal(
      light.body.operatorSite.soc.lightingOn,
      light.body.operatorSite.soc.lightingTotal
    );

    const ack = await request(app)
      .post("/api/security-floor/v1/alarm-ack")
      .send({ siteId: "SEC-JP-MORIYA-001" });
    assert.equal(ack.status, 200);
    assert.equal(ack.body.operatorSite.hasAlert, false);

    const html = fs.readFileSync(
      path.join(publicDir, "security-v1.html"),
      "utf8"
    );
    assert.match(html, /sf-iso-wrap/);
    assert.match(html, /sf-iso-orbit/);
    assert.match(html, /data-room-id="my-1f-entry"/);
    assert.match(html, /アラーム対応完了/);
    assert.match(html, /TiSLY Security/);
    assert.match(html, /security-floor-light-v1\.js\?v=2472/);
    assert.match(html, /security-floor-operator-v1\.js\?v=2472/);
    assert.match(html, /viewBox="-10 -12 120 124"/);
    assert.match(html, /← 戻る/);
    assert.doesNotMatch(html, /読み込み中/);
    assert.doesNotMatch(html, /3Dマップを再描画しています/);
    assert.doesNotMatch(html, /home-quick-switch/);
    assert.doesNotMatch(html, /屋根\/太陽光/);
    const mapJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-map-v1.js"
      ),
      "utf8"
    );
    assert.match(mapJs, /renderIsoStack/);
    assert.match(mapJs, /--drum-i/);
    assert.match(mapJs, /pulse-alarm/);
    assert.match(mapJs, /sf-iso-orbit/);
    assert.doesNotMatch(mapJs, /屋根\/太陽光/);
    const orbitJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-orbit-v1.js"
      ),
      "utf8"
    );
    const lightJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-light-v1.js"
      ),
      "utf8"
    );
    assert.match(lightJs, /rotateX/);
    assert.match(lightJs, /translateZ|drum-r/);
    assert.match(lightJs, /pulse-alarm/);
    assert.match(lightJs, /sf-demo-alert/);
    assert.match(lightJs, /\\uFEFF/);
    assert.match(orbitJs, /rotateX/);
    assert.match(orbitJs, /drum-r/);
    assert.match(orbitJs, /__TISLY_SF_ORBIT_BOUND/);
    assert.doesNotMatch(orbitJs, /rotateZ/);
    const opJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-operator-v1.js"
      ),
      "utf8"
    );
    assert.match(opJs, /bootFallback/);
    assert.match(opJs, /applyLocalPrimaryAlert/);
    assert.match(opJs, /bindSecurityOrbit/);
    assert.match(opJs, /\\uFEFF/);
    const fbJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-fallback-v1.js"
      ),
      "utf8"
    );
    assert.match(fbJs, /SEC-JP-MORIYA-001/);
    assert.match(fbJs, /つくばモデルハウス/);
    assert.doesNotMatch(fbJs, /屋根\/太陽光/);
    const customerHtml = fs.readFileSync(
      path.join(publicDir, "security-customer-v1.html"),
      "utf8"
    );
    assert.match(customerHtml, /sf-cam-expand/);
    assert.match(customerHtml, /TiSLY Security/);
    assert.match(customerHtml, /href="\/customer"/);
    assert.match(customerHtml, /security-floor-light-v1\.js/);
    assert.match(customerHtml, /sf-demo-alert/);
    assert.doesNotMatch(customerHtml, /読み込み中/);
    assert.doesNotMatch(customerHtml, /home-quick-switch/);

    const dash = buildSecurityFloorCustomerDashboardV1(
      "SEC-JP-TSUKUBA-001"
    );
    assert.equal(
      dash.floors.some((f) => f.id === "roof"),
      false
    );
    assert.ok(dash.floors.some((f) => f.id === "outdoor"));
    assert.ok(dash.floors.some((f) => f.id === "1f"));
    assert.ok(dash.floors.some((f) => f.id === "2f"));

    const notifyMoriya = await request(app)
      .post("/api/security-floor/v1/test-notify")
      .send({ siteId: "SEC-JP-MORIYA-001" });
    assert.equal(notifyMoriya.status, 200);
    const door = notifyMoriya.body.operatorSite.sensors.find(
      (s: { id: string }) => s.id === "my-door-front"
    );
    assert.equal(door.alertVisible, true);
    assert.equal(door.state, "alert");
    const entryRoom = notifyMoriya.body.operatorSite.rooms.find(
      (r: { id: string }) => r.id === "my-1f-entry"
    );
    assert.equal(entryRoom.alertVisible, true);
  });
});
