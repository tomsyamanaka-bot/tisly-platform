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
  buildHomeCustomerFacingDashboardV1,
  buildHomeCustomerSiteOptionsV1,
} from "../src/home/home-customer-facing-v1.js";
import { buildHomeCustomerMgmtViewV1 } from "../src/home/home-customer-mgmt-v1.js";
import {
  homeAirconFanToSwitchBotV1,
  homeAirconModeToSwitchBotV1,
  isSwitchBotAirconConfiguredV1,
  isSwitchBotHomeConfiguredV1,
  isSwitchBotLockConfiguredV1,
  listSwitchBotDevicesV1,
  sendSwitchBotLockCommandV1,
  buildSwitchBotHomeStatusV1,
  resolveSwitchBotHomeModeV1,
} from "../src/home/switchbot_client.js";
import { syncHomeLockFromSwitchBotV1 } from "../src/home/home-switchbot-sync-v1.js";
import {
  TISLY_CUSTOMER_RESERVED_SEGMENTS,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_INTERNAL_ROUTES_V1,
} from "../src/shared/routes/tisly-routes-v1.js";

// テストは実機 SwitchBot を呼ばない（.env に本番トークンがあっても密閉）
delete process.env.SWITCHBOT_TOKEN;
delete process.env.SWITCHBOT_SECRET;
delete process.env.SWITCHBOT_LOCK_DEVICE_ID;
delete process.env.SWITCHBOT_AIR_CONDITIONER_DEVICE_ID;

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

  it("sanitizes customer-facing dashboard without internal fields", () => {
    const d = buildHomeCustomerFacingDashboardV1(JP_SITE);
    assert.equal(d.siteId, JP_SITE);
    assert.equal(d.lock.lockLabel, "施錠済み");
    assert.match(d.lock.lastAccessLabel, /^直近の操作: /);
    assert.equal(d.lock.accessLog[0].credentialLabel, "カード");
    assert.equal(d.lock.accessLog[0].holderLabel, "山田 太郎");
    assert.equal(
      d.lock.accessLog.find((e) => e.holderLabel === "")?.credentialLabel,
      "アプリ"
    );
    assert.equal((d as { planCode?: string }).planCode, undefined);
    assert.equal((d as { countryCode?: string }).countryCode, undefined);
    assert.equal((d as { voltageSpec?: string }).voltageSpec, undefined);
    assert.equal((d.bath as { jemaTerminal?: string }).jemaTerminal, undefined);
    assert.equal(d.ct.circuits[0].voltage, undefined);
    assert.equal(d.aircons[0].powerW, undefined);
    assert.equal(d.statusLabel, "正常");

    const sites = buildHomeCustomerSiteOptionsV1();
    assert.ok(sites.some((s) => s.id === JP_SITE));
    assert.ok(sites.every((s) => !("planCode" in s)));
    assert.match(sites[0].statusLabel, /正常|注意|確認/);
  });

  it("builds internal customer-mgmt view with independent HOME sites only", () => {
    const view = buildHomeCustomerMgmtViewV1();
    assert.ok(view.totalSites >= 3);
    assert.ok(Array.isArray(view.sites));
    assert.equal(view.totalSites, view.sites.length);
    const site = view.sites.find((s) => s.siteId === JP_SITE);
    assert.ok(site);
    assert.match(site!.monthlyFeeLabel, /3,800円|3800/);
    assert.equal(site!.planCode, "home_standard");
    assert.ok(site!.registrationSourceLabel);
    // 旧構造（customers / portal properties）は廃止
    assert.equal((view as { customers?: unknown }).customers, undefined);
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

  it("controls bath, aircon and lock without dropping devices", async () => {
    const site = findHomeSiteV1(JP_SITE);

    const bathBefore = site.bath.keepWarm;
    const bath = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "keep_warm",
      value: !bathBefore,
    });
    assert.equal(bath.ok, true);
    assert.equal(site.bath.keepWarm, !bathBefore);
    await applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "keep_warm",
      value: bathBefore,
    });

    const airconCount = site.aircons.length;
    const acTempBefore = site.aircons[0].setTempC;
    const ac = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "aircon",
      action: "temp_up",
      deviceKey: site.aircons[0].deviceKey,
    });
    assert.equal(ac.ok, true);
    assert.equal(site.aircons.length, airconCount);
    assert.equal(site.aircons[0].setTempC, acTempBefore + 1);
    await applyHomeControlV1({
      siteId: JP_SITE,
      target: "aircon",
      action: "set_temp",
      deviceKey: site.aircons[0].deviceKey,
      value: acTempBefore,
    });

    const logBefore = site.lock.accessLog.length;
    const lockedBefore = site.lock.locked;
    const lock = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "lock",
      action: "toggle",
      actor: "テスト",
    });
    assert.equal(lock.ok, true);
    assert.equal(site.lock.locked, !lockedBefore);
    assert.equal(site.lock.accessLog.length, logBefore + 1);
    assert.equal(site.lock.accessLog[0].holderName, "テスト");
    await applyHomeControlV1({
      siteId: JP_SITE,
      target: "lock",
      action: lockedBefore ? "lock" : "unlock",
      actor: "テスト復帰",
    });
    assert.equal(site.lock.locked, lockedBefore);
  });

  it("accepts the bath temp_up / temp_down one-tap actions", async () => {
    const site = findHomeSiteV1(JP_SITE);
    const before = site.bath.setTempC;

    const up = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "bath",
      action: "temp_up",
    });
    assert.equal(up.ok, true);
    assert.equal(site.bath.setTempC, before + 1);

    const down = await applyHomeControlV1({
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

  it("rejects unknown control targets and sites", async () => {
    const bad = await applyHomeControlV1({
      siteId: "NOT-EXIST",
      target: "bath",
      action: "reheat",
    });
    assert.equal(bad.ok, false);

    const badAction = await applyHomeControlV1({
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

    const customerMgmt = cards.find((c) => c.id === "customer_mgmt");
    assert.ok(customerMgmt);
    assert.equal(customerMgmt.url, "/customer-view-v1");
    assert.equal(customerMgmt.status, "ready");

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
    assert.equal(customer.body.dashboard.lock.lockLabel, "施錠済み");
    assert.equal(customer.body.dashboard.planCode, undefined);

    const customerSites = await request(app).get(
      "/api/home/v1/customer-sites"
    );
    assert.equal(customerSites.status, 200);
    assert.ok(customerSites.body.sites.length >= 3);
    assert.equal(customerSites.body.sites[0].planCode, undefined);

    const mgmt = await request(app).get("/api/home/v1/customer-mgmt");
    assert.equal(mgmt.status, 200);
    assert.ok(mgmt.body.view.totalSites >= 3);
    assert.ok(Array.isArray(mgmt.body.view.sites));

    for (const p of ["/customer-view-v1", "/app/customer-view"]) {
      const page = await request(app).get(p);
      assert.equal(page.status, 200, p);
    }

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

  it("ships white light-mode PWA assets with big tap targets", () => {
    const css = fs.readFileSync(
      path.join(publicDir, "css", "features", "home", "home-v1.css"),
      "utf-8"
    );
    // 白ベース（ライトモード）
    assert.match(css, /--hm-bg:\s*#ffffff/);
    assert.match(css, /--hm-bg-2:\s*#f8fafc/);
    assert.match(css, /--hm-surface:\s*#ffffff/);
    assert.match(css, /--hm-line:\s*#e2e8f0/);
    assert.match(css, /--hm-ink:\s*#0f172a/);
    assert.match(css, /--hm-ink-2:\s*#1e293b/);
    // 高コントラストのステータス配色
    assert.match(css, /--hm-safe:\s*#16a34a/);
    assert.match(css, /--hm-danger:\s*#dc2626/);
    assert.match(css, /--hm-warn:\s*#ea580c/);
    assert.match(css, /--hm-blue:\s*#2563eb/);
    // ダークネイビー背景は残っていない
    assert.doesNotMatch(css, /#070b11/i);
    assert.match(css, /--hm-tap:\s*52px/);
    // インターホン UI
    assert.match(css, /\.hm-cam-frame/);
    assert.match(css, /\.hm-ring-popup/);

    const quickCss = fs.readFileSync(
      path.join(
        publicDir,
        "css",
        "features",
        "home",
        "home-quick-switch-v1.css"
      ),
      "utf-8"
    );
    assert.match(quickCss, /background:\s*#ffffff/);

    const operatorHtml = fs.readFileSync(
      path.join(publicDir, "home-v1.html"),
      "utf-8"
    );
    assert.match(operatorHtml, /color-scheme"\s+content="light"/);
    assert.match(operatorHtml, /theme-color"\s+content="#FFFFFF"/);
    assert.match(operatorHtml, /home-quick-switch-v1\.js/);
    assert.match(operatorHtml, /data-action="auto_fill"/);
    assert.match(operatorHtml, /data-action="reheat"/);
    assert.match(operatorHtml, /data-action="keep_warm"/);
    assert.match(operatorHtml, /data-target="lock"/);
    // スマートインターホン
    assert.match(operatorHtml, /id="hm-intercom-card"/);
    assert.match(operatorHtml, /id="hm-ring-popup"/);
    assert.match(operatorHtml, /data-action="answer"/);
    assert.match(operatorHtml, /data-action="auto_response"/);
    assert.match(operatorHtml, /data-action="unlock_door"/);
    assert.match(operatorHtml, /id="hm-switchbot-badge"/);

    const customerHtml = fs.readFileSync(
      path.join(publicDir, "home-customer-v1.html"),
      "utf-8"
    );
    assert.match(customerHtml, /color-scheme"\s+content="light"/);
    assert.match(customerHtml, /data-hqs-mode="customer"/);
    assert.match(customerHtml, /おうちの設備/);
    assert.match(customerHtml, /id="hm-intercom-card"/);
    assert.match(customerHtml, /id="hm-ring-popup"/);
    // お客様 UI に技術語を出さない
    assert.doesNotMatch(customerHtml, /SwitchBot/);
    assert.doesNotMatch(customerHtml, /RTSP/);
    assert.doesNotMatch(customerHtml, /NFC\s*\/\s*RFID/);
    assert.doesNotMatch(customerHtml, /LOCKED/);
    assert.match(customerHtml, /カギの履歴/);

    const customerViewHtml = fs.readFileSync(
      path.join(publicDir, "customer-view-v1.html"),
      "utf-8"
    );
    assert.match(customerViewHtml, /顧客を見る/);
    assert.match(customerViewHtml, /cv-add-btn/);
    assert.match(customerViewHtml, /新規登録/);
    assert.match(customerViewHtml, /customer-view-v1\.js/);

    const sharedJs = fs.readFileSync(
      path.join(
        publicDir,
        "js",
        "features",
        "home",
        "home-shared-v1.js"
      ),
      "utf-8"
    );
    assert.match(sharedJs, /export function renderIntercom/);
    assert.match(sharedJs, /export function updateRingPopup/);

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
    assert.match(sw, /tisly-pwa-v2469-security-light|tisly-pwa-v2468-soc-failsafe|tisly-pwa-v2467-soc-iso|tisly-pwa-v2466-security-floor|tisly-pwa-v2465-genre-chips|tisly-pwa-v2464-genre-chips|tisly-pwa-v2463-unified-genres|tisly-pwa-v2462-price-cost-master|tisly-pwa-v2461-home-customer-independent/);
    assert.match(sw, /\/css\/features\/home\/home-v1\.css/);
    assert.match(sw, /\/css\/features\/home\/home-tiles-v1\.css/);
    assert.match(sw, /\/js\/features\/home\/home-tiles-v1\.js/);
  });

  it("renders the device tile grid in工事屋 priority order", () => {
    const tilesJs = fs.readFileSync(
      path.join(publicDir, "js", "features", "home", "home-tiles-v1.js"),
      "utf-8"
    );
    // 工事屋目線の並び: CT → ロック → インターホン → 風呂 → エアコン
    assert.match(
      tilesJs,
      /HOME_TILE_ORDER_V1 = \[\s*"ct",\s*"lock",\s*"intercom",\s*"bath",\s*"aircon",?\s*\]/
    );
    // 機器名（社内表記）
    assert.match(tilesJs, /分電盤CT/);
    assert.match(tilesJs, /スマートロック/);
    assert.match(tilesJs, /インターホン/);
    assert.match(tilesJs, /風呂/);
    // 状態テキスト（v2 ミニマル）
    assert.match(tilesJs, /施錠中/);
    assert.match(tilesJs, /解錠中/);
    assert.match(tilesJs, /湯はり中/);
    assert.match(tilesJs, /呼出中/);
    assert.match(tilesJs, /待機中/);
    assert.match(tilesJs, /停止中/);
    assert.match(tilesJs, /\$\{fixed1\(ct\.mainCurrentA\)\} A/);
    assert.doesNotMatch(tilesJs, /詳しく操作する/);
    // タイル右上のワンタップ操作
    assert.match(tilesJs, /class="hm-tile-action/);
    assert.match(tilesJs, /data-target="\$\{escapeHtml\(action\.target\)\}"/);
    // 詳細パネル開閉
    assert.match(tilesJs, /export function renderHomeTilesV1/);
    assert.match(tilesJs, /export function bindHomeTileDetailsV1/);
    assert.match(tilesJs, /export function openHomeDetailV1/);

    const tilesCss = fs.readFileSync(
      path.join(publicDir, "css", "features", "home", "home-tiles-v1.css"),
      "utf-8"
    );
    // 2列グリッド（スマホ）＋ 可変グリッド（広い画面）
    assert.match(
      tilesCss,
      /\.hm-tile-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/
    );
    assert.match(tilesCss, /@media \(min-width: 760px\)/);
    // タップ領域 44px 以上
    assert.match(tilesCss, /\.hm-tile-action\s*\{[^}]*min-height:\s*44px/);
    assert.match(tilesCss, /\.hm-tile-open\s*\{[^}]*min-height:\s*64px/);
    assert.match(tilesCss, /#e2e8f0/);
    assert.match(tilesCss, /#16a34a/);
    assert.match(tilesCss, /#dc2626/);
    assert.match(tilesCss, /\.hm-detail-close\s*\{[^}]*min-height:\s*44px/);
    // 既存カード CSS は削除していない
    const baseCss = fs.readFileSync(
      path.join(publicDir, "css", "features", "home", "home-v1.css"),
      "utf-8"
    );
    assert.match(baseCss, /\.hm-ac-temp-row/);
    assert.match(baseCss, /\.hm-circuit-row/);

    for (const page of ["home-v1.html", "home-customer-v1.html"]) {
      const html = fs.readFileSync(path.join(publicDir, page), "utf-8");
      assert.match(html, /home-tiles-v1\.css/, page);
      assert.match(html, /id="hm-tile-grid"/, page);
      assert.match(html, /id="hm-detail-stack"/, page);
      // 5機器ぶんの詳細パネルがタイルから開く
      for (const key of ["ct", "lock", "intercom", "bath", "aircon"]) {
        assert.match(
          html,
          new RegExp(`data-detail="${key}"`),
          `${page} ${key} パネル`
        );
        assert.match(
          html,
          new RegExp(`data-detail-close="${key}"`),
          `${page} ${key} 閉じる`
        );
      }
      // 既存の詳細操作（回路・湯はり・エアコン・施錠・インターホン）は残す
      assert.match(html, /id="hm-circuit-list"/, page);
      assert.match(html, /data-action="auto_fill"/, page);
      assert.match(html, /id="hm-aircon-list"/, page);
      assert.match(html, /id="hm-lock-toggle"/, page);
      assert.match(html, /id="hm-intercom-visitors"/, page);
    }

    // お客様向けはやさしい表現（技術語を出さない）
    assert.match(tilesJs, /plainName: "電気"/);
    assert.match(tilesJs, /plainName: "玄関のかぎ"/);

    for (const entry of [
      "home-operator-v1.js",
      "home-customer-v1.js",
    ]) {
      const js = fs.readFileSync(
        path.join(publicDir, "js", "features", "home", entry),
        "utf-8"
      );
      assert.match(js, /renderHomeTilesV1/, entry);
      assert.match(js, /bindHomeTileDetailsV1/, entry);
    }
  });

  it("adds smart intercom to every site and dashboard", () => {
    for (const site of HOME_SITES_V1) {
      assert.ok(site.intercom.deviceKey, `${site.id} intercom`);
      assert.equal(site.intercom.controlChannel, "intercom_sip");
      assert.ok(site.intercom.autoResponseMessage.length > 0, site.id);
    }

    const d = buildHomeCustomerDashboardV1(JP_SITE);
    assert.equal(d.intercom.stateLabel, "待機中");
    assert.equal(d.intercom.ringing, false);
    assert.equal(d.intercomRinging, false);
    assert.match(d.intercom.lastVisitLabel, /^直近来客 .*\d{1,2}:\d{2}$/);
    // カメラ未接続はモック枠で表示する
    assert.equal(d.intercom.hasLiveStream, false);
    assert.equal(d.intercom.streamKind, "mock");
    assert.ok(d.intercom.visitors.length >= 1);
    assert.equal(d.intercom.visitors[0].handledLabel, "自動応答");

    const alert = buildHomeCustomerDashboardV1(ALERT_SITE);
    assert.equal(alert.intercom.ringing, true);
    assert.equal(alert.intercom.stateLabel, "呼出中");
    assert.equal(alert.intercom.stateEmoji, "🔔");
    assert.equal(alert.intercomRinging, true);

    const operator = buildHomeOperatorDashboardV1();
    assert.ok(operator.intercomRingingCount >= 1);
  });

  it("answers, auto-responds and unlocks from the intercom", async () => {
    const site = findHomeSiteV1(JP_SITE);
    const stateBefore = site.intercom.state;
    const lockedBefore = site.lock.locked;
    const accessLogBefore = site.lock.accessLog.length;

    const ring = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "intercom",
      action: "ring",
      value: "宅配便",
    });
    assert.equal(ring.ok, true);
    assert.equal(site.intercom.state, "ringing");
    assert.equal(site.intercom.visitors[0].label, "宅配便");

    const answer = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "intercom",
      action: "answer",
      actor: "テスト応答",
    });
    assert.equal(answer.ok, true);
    assert.equal(site.intercom.state, "talking");
    assert.equal(site.intercom.visitors[0].handledAs, "answered");

    const auto = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "intercom",
      action: "auto_response",
    });
    assert.equal(auto.ok, true);
    assert.equal(site.intercom.state, "auto_responded");
    assert.match(String(auto.message), /置き配/);

    // 玄関鍵を開ける（スマートロック連動）
    const unlock = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "intercom",
      action: "unlock_door",
      actor: "インターホン応答",
    });
    assert.equal(unlock.ok, true);
    assert.equal(site.lock.locked, false);
    assert.equal(site.lock.accessLog.length, accessLogBefore + 1);
    assert.equal(site.intercom.state, "idle");

    const bad = await applyHomeControlV1({
      siteId: JP_SITE,
      target: "intercom",
      action: "explode",
    });
    assert.equal(bad.ok, false);

    // 解錠を許可していない物件では拒否する
    const au = findHomeSiteV1(AU_SITE);
    assert.equal(au.intercom.unlockLinkEnabled, false);
    const denied = await applyHomeControlV1({
      siteId: AU_SITE,
      target: "intercom",
      action: "unlock_door",
    });
    assert.equal(denied.ok, false);

    // 後始末
    await applyHomeControlV1({
      siteId: JP_SITE,
      target: "lock",
      action: lockedBefore ? "lock" : "unlock",
      actor: "テスト復帰",
    });
    site.intercom.state = stateBefore;
  });

  it("serves intercom control and switchbot status over the API", async () => {
    const status = await request(app).get(
      "/api/home/v1/switchbot-status"
    );
    assert.equal(status.status, 200);
    assert.equal(status.body.ok, true);
    assert.ok(["real", "mock"].includes(status.body.switchbot.mode));
    assert.equal(status.body.switchbot.token, undefined);
    assert.equal(status.body.switchbot.secret, undefined);

    const res = await request(app)
      .post("/api/home/v1/control")
      .send({
        siteId: JP_SITE,
        target: "intercom",
        action: "ring",
        value: "テスト来客",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.dashboard.intercom.ringing, true);

    const dismiss = await request(app)
      .post("/api/home/v1/control")
      .send({ siteId: JP_SITE, target: "intercom", action: "dismiss" });
    assert.equal(dismiss.status, 200);
    assert.equal(dismiss.body.dashboard.intercom.ringing, false);

    const events = await request(app).get(
      `/api/home/v1/intercom-events?siteId=${JP_SITE}`
    );
    assert.equal(events.status, 200);
    assert.equal(events.body.ok, true);
    assert.ok(Array.isArray(events.body.events));
  });

  it("falls back to mock when SwitchBot credentials are unset", async () => {
    const prev = {
      token: process.env.SWITCHBOT_TOKEN,
      secret: process.env.SWITCHBOT_SECRET,
      lockId: process.env.SWITCHBOT_LOCK_DEVICE_ID,
      acId: process.env.SWITCHBOT_AIR_CONDITIONER_DEVICE_ID,
    };
    try {
      delete process.env.SWITCHBOT_TOKEN;
      delete process.env.SWITCHBOT_SECRET;
      delete process.env.SWITCHBOT_LOCK_DEVICE_ID;
      delete process.env.SWITCHBOT_AIR_CONDITIONER_DEVICE_ID;

      assert.equal(isSwitchBotHomeConfiguredV1(), false);
      assert.equal(isSwitchBotLockConfiguredV1(), false);
      assert.equal(isSwitchBotAirconConfiguredV1(), false);

      const listed = await listSwitchBotDevicesV1();
      assert.equal(listed.ok, false);
      assert.equal(listed.skipped, true);

      const cmd = await sendSwitchBotLockCommandV1("unlock");
      assert.equal(cmd.ok, false);
      assert.equal(cmd.skipped, true);

      const sync = await syncHomeLockFromSwitchBotV1(JP_SITE);
      assert.equal(sync.synced, false);
      assert.equal(sync.skipped, true);

      // モック制御は引き続き成功
      const site = findHomeSiteV1(JP_SITE);
      const before = site.lock.locked;
      const lock = await applyHomeControlV1({
        siteId: JP_SITE,
        target: "lock",
        action: "toggle",
        actor: "mock-fallback",
      });
      assert.equal(lock.ok, true);
      assert.equal(site.lock.locked, !before);
      await applyHomeControlV1({
        siteId: JP_SITE,
        target: "lock",
        action: before ? "lock" : "unlock",
        actor: "mock-fallback-restore",
      });

      assert.equal(homeAirconModeToSwitchBotV1("cool"), 2);
      assert.equal(homeAirconModeToSwitchBotV1("heat"), 5);
      assert.equal(homeAirconModeToSwitchBotV1("dry"), 3);
      assert.equal(homeAirconModeToSwitchBotV1("fan"), 4);
      assert.equal(homeAirconFanToSwitchBotV1("auto"), 1);
      assert.equal(homeAirconFanToSwitchBotV1("high"), 4);

      // 資格情報なし → mock
      assert.equal(resolveSwitchBotHomeModeV1(), "mock");
      const mockStatus = buildSwitchBotHomeStatusV1();
      assert.equal(mockStatus.mode, "mock");
      assert.ok(mockStatus.missing.includes("SWITCHBOT_TOKEN"));
      assert.match(mockStatus.message, /モック/);

      // 資格情報あり → 本番 VPS でも自動で real
      process.env.SWITCHBOT_TOKEN = "dummy-token-for-test";
      process.env.SWITCHBOT_SECRET = "dummy-secret-for-test";
      process.env.SWITCHBOT_LOCK_DEVICE_ID = "AA:BB:CC:DD:EE:FF";
      process.env.SWITCHBOT_AIR_CONDITIONER_DEVICE_ID = "01-202508-12345678";
      assert.equal(resolveSwitchBotHomeModeV1(), "real");
      const realStatus = buildSwitchBotHomeStatusV1();
      assert.equal(realStatus.mode, "real");
      assert.equal(realStatus.lockConfigured, true);
      assert.equal(realStatus.airConditionerConfigured, true);
      assert.deepEqual(realStatus.missing, []);
      // トークン・シークレット・完全な deviceId は返さない
      const serialized = JSON.stringify(realStatus);
      assert.doesNotMatch(serialized, /dummy-token-for-test/);
      assert.doesNotMatch(serialized, /dummy-secret-for-test/);
      assert.equal(realStatus.lockDeviceIdMask, "****E:FF");
    } finally {
      if (prev.token !== undefined) process.env.SWITCHBOT_TOKEN = prev.token;
      else delete process.env.SWITCHBOT_TOKEN;
      if (prev.secret !== undefined) process.env.SWITCHBOT_SECRET = prev.secret;
      else delete process.env.SWITCHBOT_SECRET;
      if (prev.lockId !== undefined)
        process.env.SWITCHBOT_LOCK_DEVICE_ID = prev.lockId;
      else delete process.env.SWITCHBOT_LOCK_DEVICE_ID;
      if (prev.acId !== undefined)
        process.env.SWITCHBOT_AIR_CONDITIONER_DEVICE_ID = prev.acId;
      else delete process.env.SWITCHBOT_AIR_CONDITIONER_DEVICE_ID;
    }
  });
});
