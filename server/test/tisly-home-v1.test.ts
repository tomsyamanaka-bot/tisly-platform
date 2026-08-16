import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { buildPracticalHubCards } from "../src/pwa/pwa-hub.js";
import { CUSTOMER_HOME_CARDS_V1 } from "../src/shared/customer/customer-labels-v1.js";
import { buildCustomerHomeStateV1 } from "../src/shared/customer/customer-home-state-v1.js";
import {
  HOME_SITES_V1,
  findHomeSiteV1,
  homeCtLevelV1,
  homeLoadPercentV1,
  homeSecurityAttentionV1,
} from "../src/home/home-sites-v1.js";
import {
  applyHomeControlV1,
  setHomeCircuitStateV1,
} from "../src/home/home-control-v1.js";
import {
  buildHomeCustomerDashboardV1,
  buildHomeOperatorDashboardV1,
  buildHomeQuickSwitchV1,
} from "../src/home/home-dashboard-v1.js";
import {
  TISLY_CUSTOMER_RESERVED_SEGMENTS,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_INTERNAL_ROUTES_V1,
} from "../src/shared/routes/tisly-routes-v1.js";

const app = createApp();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const JP_SITE = "HOME-JP-TSUKUBA-001";
const AU_SITE = "HOME-AU-GOLDCOAST-001";
const ALERT_SITE = "HOME-JP-MORIYA-ALERT";

describe("tisly-home-v1", () => {
  it("provides JP and AU mock sites with 4 device groups", () => {
    assert.ok(HOME_SITES_V1.length >= 3);
    assert.ok(HOME_SITES_V1.some((s) => s.countryCode === "JP"));
    assert.ok(HOME_SITES_V1.some((s) => s.countryCode === "AU"));
    assert.ok(HOME_SITES_V1.some((s) => s.currency === "JPY"));
    assert.ok(HOME_SITES_V1.some((s) => s.currency === "AUD"));

    for (const site of HOME_SITES_V1) {
      assert.ok(site.tenantId, `${site.id} tenantId`);
      assert.ok(site.planCode, `${site.id} planCode`);
      assert.ok(site.ct.circuits.length >= 3, `${site.id} circuits`);
      assert.equal(site.ct.hourlyCurrentA.length, 24, site.id);
      assert.ok(site.bath.deviceKey, `${site.id} bath`);
      assert.ok(site.aircons.length >= 1, `${site.id} aircon`);
      assert.ok(site.lock.deviceKey, `${site.id} lock`);
    }

    const jp = findHomeSiteV1(JP_SITE);
    assert.equal(jp.displayName, "つくばモデルハウス");
    assert.match(jp.voltageSpec, /100V/);
    assert.match(jp.hotWaterSpec, /エコキュート/);

    const au = findHomeSiteV1(AU_SITE);
    assert.equal(au.displayName, "Gold Coast Demo House");
    assert.match(au.voltageSpec, /240V/);
    assert.ok(au.ct.solarGenerationW > 0, "AU は Solar+CT");
  });

  it("computes CT thresholds and security attention", () => {
    const jp = findHomeSiteV1(JP_SITE);
    assert.equal(homeCtLevelV1(jp), "normal");
    assert.equal(homeSecurityAttentionV1(jp), false);
    assert.ok(homeLoadPercentV1(jp) > 0);

    const alert = findHomeSiteV1(ALERT_SITE);
    assert.equal(homeCtLevelV1(alert), "alert");
    assert.equal(homeSecurityAttentionV1(alert), true);
  });

  it("builds customer dashboard with all four devices", () => {
    const d = buildHomeCustomerDashboardV1(JP_SITE);
    assert.equal(d.siteId, JP_SITE);
    assert.equal(d.status, "normal");
    assert.equal(d.statusEmoji, "🟢");

    assert.ok(d.ct.mainCurrentA > 0);
    assert.equal(d.ct.levelLabel, "正常");
    assert.equal(d.ct.circuits.length, 5);

    assert.equal(d.bath.fillStateLabel, "湯はり中");
    assert.equal(d.bath.autoFill, true);

    assert.equal(d.aircons.length, 2);
    assert.equal(d.aircons[0].modeLabel, "冷房");

    assert.equal(d.lock.lockLabel, "LOCKED");
    assert.equal(d.lock.lockEmoji, "🔒");
    assert.ok(d.lock.accessLog.length >= 1);
    assert.equal(d.lock.accessLog[0].credentialLabel, "NFC");

    const alert = buildHomeCustomerDashboardV1(ALERT_SITE);
    assert.equal(alert.status, "security_alert");
    assert.equal(alert.lock.lockLabel, "UNLOCKED");
    assert.equal(alert.lock.doorLabel, "ドア開");
  });

  it("sorts operator dashboard with alerts first", () => {
    const dash = buildHomeOperatorDashboardV1();
    assert.ok(dash.totalSites >= 3);
    assert.equal(dash.sites[0].status, "security_alert");
    assert.ok(dash.securityAlertCount >= 1);
    assert.ok(dash.overloadCount >= 1);
    assert.ok(dash.airconRunningCount >= 1);
  });

  it("exposes quick switch entries for both zones", () => {
    const items = buildHomeQuickSwitchV1();
    assert.ok(items.length >= 3);
    const jp = items.find((i) => i.siteId === JP_SITE);
    assert.ok(jp);
    assert.equal(jp.internalHref, `/home-v1?siteId=${JP_SITE}`);
    assert.equal(jp.customerHref, `/customer/home?siteId=${JP_SITE}`);
  });

  it("controls bath, aircon and lock without dropping devices", () => {
    const site = findHomeSiteV1(JP_SITE);

    const bathBefore = site.bath.keepWarm;
    const bath = applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "keep_warm",
      value: !bathBefore,
    });
    assert.equal(bath.ok, true);
    assert.equal(site.bath.keepWarm, !bathBefore);
    applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "keep_warm",
      value: bathBefore,
    });

    const airconCount = site.aircons.length;
    const acTempBefore = site.aircons[0].setTempC;
    const ac = applyHomeControlV1({
      siteId: JP_SITE,
      target: "aircon",
      action: "temp_up",
      deviceKey: site.aircons[0].deviceKey,
    });
    assert.equal(ac.ok, true);
    assert.equal(site.aircons.length, airconCount);
    assert.equal(site.aircons[0].setTempC, acTempBefore + 1);
    applyHomeControlV1({
      siteId: JP_SITE,
      target: "aircon",
      action: "set_temp",
      deviceKey: site.aircons[0].deviceKey,
      value: acTempBefore,
    });

    const logBefore = site.lock.accessLog.length;
    const lockedBefore = site.lock.locked;
    const lock = applyHomeControlV1({
      siteId: JP_SITE,
      target: "lock",
      action: "toggle",
      actor: "テスト",
    });
    assert.equal(lock.ok, true);
    assert.equal(site.lock.locked, !lockedBefore);
    assert.equal(site.lock.accessLog.length, logBefore + 1);
    assert.equal(site.lock.accessLog[0].holderName, "テスト");
    applyHomeControlV1({
      siteId: JP_SITE,
      target: "lock",
      action: lockedBefore ? "lock" : "unlock",
      actor: "テスト復帰",
    });
    assert.equal(site.lock.locked, lockedBefore);
  });

  it("accepts the bath temp_up / temp_down one-tap actions", () => {
    const site = findHomeSiteV1(JP_SITE);
    const before = site.bath.setTempC;

    const up = applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "temp_up",
    });
    assert.equal(up.ok, true);
    assert.equal(site.bath.setTempC, before + 1);

    const down = applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "temp_down",
    });
    assert.equal(down.ok, true);
    assert.equal(site.bath.setTempC, before);
  });

  it("recomputes main current when a circuit is switched", () => {
    const site = findHomeSiteV1(AU_SITE);
    const circuitCount = site.ct.circuits.length;
    const target = site.ct.circuits.find((c) => c.on);
    assert.ok(target);
    const beforeA = site.ct.mainCurrentA;
    const beforeCurrent = target.currentA;

    setHomeCircuitStateV1(AU_SITE, target.id, false);
    assert.equal(site.ct.circuits.length, circuitCount);
    assert.ok(site.ct.mainCurrentA < beforeA);

    setHomeCircuitStateV1(AU_SITE, target.id, true);
    site.ct.circuits.find((c) => c.id === target.id)!.currentA =
      beforeCurrent;
  });

  it("rejects unknown control targets and sites", () => {
    const bad = applyHomeControlV1({
      siteId: "NOT-EXIST",
      target: "bath",
      action: "reheat",
    });
    assert.equal(bad.ok, false);

    const badAction = applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "explode",
    });
    assert.equal(badAction.ok, false);
  });

  it("registers routes, hub card and customer card", () => {
    assert.ok(
      TISLY_INTERNAL_ROUTES_V1.some((r) => r.path === "/home-v1")
    );
    assert.ok(
      TISLY_INTERNAL_ROUTES_V1.some((r) => r.path === "/app/home")
    );
    assert.ok(
      TISLY_CUSTOMER_ROUTES_V1.some((r) => r.path === "/customer/home")
    );
    assert.ok(TISLY_CUSTOMER_RESERVED_SEGMENTS.has("home"));

    const cards = buildPracticalHubCards("surveyor");
    // 既存カードを消していないこと
    assert.ok(cards.some((c) => c.id === "eco_water_v1"));
    assert.ok(cards.some((c) => c.id === "gas_monitor_v1"));
    assert.ok(cards.some((c) => c.id === "demand_security_v1"));
    const home = cards.find((c) => c.id === "tisly_home_v1");
    assert.ok(home);
    assert.equal(home.url, "/home-v1");

    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "eco_water"));
    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "gas_monitor"));
    assert.ok(
      CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "demand_security")
    );
    assert.ok(CUSTOMER_HOME_CARDS_V1.some((c) => c.id === "tisly_home"));
    assert.ok(CUSTOMER_HOME_CARDS_V1.length >= 10);

    const state = buildCustomerHomeStateV1({
      shareId: "demo-share",
      propertyName: "デモ物件",
    });
    assert.equal(
      state.cards.find((c) => c.id === "tisly_home")?.href,
      "/customer/home"
    );
  });

  it("serves pages and APIs", async () => {
    for (const p of ["/home-v1", "/app/home", "/customer/home"]) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
    }

    const redirect = await request(app).get("/tisly-home");
    assert.equal(redirect.status, 302);

    const sites = await request(app).get("/api/home/v1/sites");
    assert.equal(sites.status, 200);
    assert.equal(sites.body.ok, true);
    assert.ok(sites.body.sites.length >= 3);
    assert.ok(
      sites.body.sites.some(
        (s: { countryCode: string }) => s.countryCode === "AU"
      )
    );

    const customer = await request(app).get(
      `/api/home/v1/customer?siteId=${JP_SITE}`
    );
    assert.equal(customer.status, 200);
    assert.equal(customer.body.dashboard.siteId, JP_SITE);

    const operator = await request(app).get("/api/home/v1/operator");
    assert.equal(operator.status, 200);
    assert.ok(operator.body.dashboard.totalSites >= 3);

    const quick = await request(app).get("/api/home/v1/quick-switch");
    assert.equal(quick.status, 200);
    assert.ok(quick.body.items.length >= 3);
  });

  it("applies control through the API and restores state", async () => {
    const before = buildHomeCustomerDashboardV1(JP_SITE);
    const wasOn = before.aircons[0].power;

    const res = await request(app)
      .post("/api/home/v1/control")
      .send({
        siteId: JP_SITE,
        target: "aircon",
        action: "power",
        deviceKey: before.aircons[0].deviceKey,
        value: !wasOn,
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.dashboard.aircons[0].power, !wasOn);

    const bad = await request(app)
      .post("/api/home/v1/control")
      .send({ siteId: JP_SITE, target: "unknown", action: "x" });
    assert.equal(bad.status, 400);

    // 元に戻す
    await request(app).post("/api/home/v1/control").send({
      siteId: JP_SITE,
      target: "aircon",
      action: "power",
      deviceKey: before.aircons[0].deviceKey,
      value: wasOn,
    });
  });

  it("ships dark high-contrast PWA assets with big tap targets", () => {
    const css = fs.readFileSync(
      path.join(publicDir, "css", "features", "home", "home-v1.css"),
      "utf-8"
    );
    assert.match(css, /--hm-bg:\s*#070b11/);
    assert.match(css, /--hm-tap:\s*52px/);

    const operatorHtml = fs.readFileSync(
      path.join(publicDir, "home-v1.html"),
      "utf-8"
    );
    assert.match(operatorHtml, /color-scheme"\s+content="dark"/);
    assert.match(operatorHtml, /home-quick-switch-v1\.js/);
    assert.match(operatorHtml, /data-action="auto_fill"/);
    assert.match(operatorHtml, /data-action="reheat"/);
    assert.match(operatorHtml, /data-action="keep_warm"/);
    assert.match(operatorHtml, /data-target="lock"/);

    const customerHtml = fs.readFileSync(
      path.join(publicDir, "home-customer-v1.html"),
      "utf-8"
    );
    assert.match(customerHtml, /data-hqs-mode="customer"/);
    assert.match(customerHtml, /おうちの設備/);

    // 各画面へのクイック切り替え追記（既存 script は維持）
    for (const page of [
      "app-hub.html",
      "gas-monitor-v1.html",
      "demand-security-v1.html",
      "eco-water-v1.html",
    ]) {
      const html = fs.readFileSync(
        path.join(publicDir, page),
        "utf-8"
      );
      assert.match(
        html,
        /home-quick-switch-v1\.js/,
        `${page} にクイック切り替えがない`
      );
    }

    const sw = fs.readFileSync(
      path.join(publicDir, "service-worker.js"),
      "utf-8"
    );
    assert.match(sw, /tisly-pwa-v2457-tisly-home/);
    assert.match(sw, /\/css\/features\/home\/home-v1\.css/);
  });
});
