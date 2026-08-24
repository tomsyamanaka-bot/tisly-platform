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
  buildSecurityFloorOperatorSiteV1,
} from "../src/security-floor/security-floor-dashboard-v1.js";
import {
  ackSecurityAlarmsV1,
  recordHomeDiSecurityAlarmV1,
} from "../src/security-floor/security-floor-soc-v1.js";
import {
  TISLY_CUSTOMER_RESERVED_SEGMENTS,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_INTERNAL_ROUTES_V1,
} from "../src/shared/routes/tisly-routes-v1.js";

const app = createApp();
const publicDir = path.resolve("public");

describe("security-floor-v1", () => {
  it("appends JP/AU floor sites without shrinking catalog", () => {
    assert.ok(SECURITY_FLOOR_SITES_V1.length >= 4);
    const jp = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-JP-TSUKUBA-001"
    );
    const au = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-AU-SYDNEY-001"
    );
    const moriya = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-JP-MORIYA-001"
    );
    const itabashi = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === "SEC-JP-ITABASHI-LIVE"
    );
    assert.ok(jp);
    assert.ok(au);
    assert.ok(moriya);
    assert.ok(itabashi);
    assert.equal(itabashi.displayName, "板橋自宅");
    assert.equal(itabashi.addressLabel, "東京都板橋区");
    assert.match(itabashi.notes.join(" "), /HOME-JP-ITABASHI-LIVE/);
    assert.equal(moriya.addressLabel.includes("守谷"), true);
    assert.equal(moriya.displayName.includes("平屋"), true);
    assert.ok(moriya.rooms.some((r) => r.label === "勝手口キッチン"));
    assert.ok(moriya.rooms.some((r) => r.label === "リビング洋"));
    assert.ok(moriya.rooms.some((r) => r.label === "和8畳"));
    assert.ok(moriya.sensors.some((s) => s.id === "my-door-katte"));
    assert.equal(
      moriya.floors.find((f) => f.id === "1f")?.enabled,
      true
    );
    assert.equal(
      moriya.floors.find((f) => f.id === "2f")?.enabled,
      false
    );
    assert.equal(
      moriya.rooms.some((r) => r.id === "my-2f-empty"),
      false
    );
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
    assert.equal(sec.label, "TiSLY Security");
    assert.match(sec.subtitle || "", /実機センサー/);
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
    assert.match(css, /alert-beacon/);
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
    assert.match(css, /#334155/);
    assert.match(css, /touch-action: pan-y/);
    assert.match(css, /display: none !important/);
    assert.match(css, /clamp\(260px|max-height:\s*300px|isometric-container/);

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
    assert.ok(notify.body.push);
    assert.equal(typeof notify.body.push.success, "boolean");
    assert.equal(typeof notify.body.push.subscriptionCount, "number");
    assert.ok(Array.isArray(notify.body.push.attempts));
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
    assert.match(html, /sf-iso3d-mount/);
    assert.match(html, /data-room-id="my-1f-katte"/);
    assert.match(html, /勝手口キッチン/);
    assert.match(html, /リビング洋/);
    assert.match(html, /和10畳/);
    assert.match(html, /廊下（3尺）/);
    assert.match(html, /アラーム対応完了/);
    assert.match(html, /TiSLY Security/);
    assert.match(html, /sf-remote-config/);
    assert.match(html, /sf-notify-policy/);
    assert.match(html, /DI1単独：サイレント/);
    assert.match(html, /DI1➔DI2段階侵入：緊急通知ON/);
    assert.match(html, /DI2単独：即時Web Push/);
    assert.match(html, /data-notify-mode/);
    assert.match(html, /sf-remote-apply/);
    assert.match(html, /security-floor-remote-config-v1\.js\?v=2500/);
    assert.match(html, /security-floor-push-v1\.js\?v=2500/);
    assert.match(html, /security-floor-light-v1\.js\?v=2500/);
    assert.match(html, /security-floor-operator-v1\.js\?v=2500/);
    assert.match(html, /security-floor-iso3d-v1\.js\?v=2500/);
    assert.match(html, /security-floor-v1\.css\?v=2500/);
    assert.doesNotMatch(html, /sf-live-feed|sf-cam-thumbs|sf-cam-expand|ライブカメラ/);
    assert.doesNotMatch(html, /勝手口カメラ 01/);
    assert.match(html, /sf-push-reregister/);
    assert.match(html, /Push通知を再登録・購読/);
    assert.match(html, /sf-iso3d-stack/);
    assert.match(html, /sf-log-compact/);
    assert.match(html, /sf-log-dialog/);
    assert.match(html, /詳細を見る（もっと見る）/);
    assert.match(html, /importmap/);
    assert.match(html, /viewBox="-10 -12 120 124"/);
    assert.match(html, /← 戻る/);
    assert.match(html, /data-focus="1f"/);
    assert.doesNotMatch(html, /読み込み中/);
    assert.doesNotMatch(html, /3Dマップを再描画しています/);
    assert.doesNotMatch(html, /home-quick-switch/);
    assert.doesNotMatch(html, /屋根\/太陽光/);
    assert.doesNotMatch(html, /美園の家/);
    assert.doesNotMatch(html, /玄関ホール/);
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
    assert.match(mapJs, /alert-beacon/);
    assert.match(mapJs, /sf-iso-orbit/);
    assert.match(mapJs, /sf-iso3d-mount/);
    assert.match(mapJs, /floorHasContent/);
    assert.doesNotMatch(mapJs, /屋根\/太陽光/);
    const iso3dJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-iso3d-v1.js"
      ),
      "utf8"
    );
    assert.match(iso3dJs, /OrbitControls/);
    assert.match(iso3dJs, /createNeonPinMesh3d/);
    assert.match(iso3dJs, /TislySecurityIso3d/);
    assert.match(iso3dJs, /setAlert/);
    assert.match(iso3dJs, /wallHeight/);
    assert.match(iso3dJs, /tisly-neon-pin-mesh/);
    assert.match(iso3dJs, /deviceToWorldPosV1|worldX/);
    assert.match(iso3dJs, /外壁フレーム/);
    assert.match(iso3dJs, /stackExpand|STACK_GAP/);
    assert.match(iso3dJs, /perimeter|critical/);
    assert.match(iso3dJs, /発報地点/);
    assert.match(iso3dJs, /0xf8fafc|f8fafc/);
    assert.match(iso3dJs, /0x475569|475569|0x334155|334155/);
    assert.match(iso3dJs, /CAM_ELEV|cameraElevationDeg/);
    assert.match(iso3dJs, /setOrbitEnabled/);
    assert.match(iso3dJs, /enableZoom\s*=\s*true/);
    assert.match(iso3dJs, /CAM_ZOOM_MIN|minDistance/);
    assert.match(iso3dJs, /CAM_ZOOM_MAX|maxDistance/);
    assert.match(iso3dJs, /TOUCH\.DOLLY_PAN|DOLLY_PAN/);
    assert.match(iso3dJs, /resetCameraHome|DOUBLE_TAP/);
    assert.match(iso3dJs, /shadeRoomMaterials/);
    assert.match(iso3dJs, /focusAnim/);
    assert.match(iso3dJs, /reelAnim|startReelTransition|REEL_SLIDE/);
    assert.match(iso3dJs, /ResizeObserver|onResize/);
    assert.match(iso3dJs, /EDGE_ASH|0x334155|334155/);
    assert.match(iso3dJs, /layer\.visible\s*=/);
    assert.match(iso3dJs, /SOLID_OPACITY|transparent:\s*false/);
    assert.match(iso3dJs, /labelRenderer\.domElement\.innerHTML\s*=\s*""/);
    assert.match(iso3dJs, /isCSS2DObject/);
    assert.match(iso3dJs, /children\.slice\(\)/);
    assert.doesNotMatch(iso3dJs, /NON_FOCUS_OPACITY/);
    assert.doesNotMatch(iso3dJs, /buildDevicePinHtml/);
    assert.doesNotMatch(iso3dJs, /new CSS2DObject\(el\)/);
    assert.doesNotMatch(html, /sf-opt-cam/);
    const pinMeshJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/shared/tisly-neon-pin-mesh-v1.js"
      ),
      "utf8"
    );
    assert.match(pinMeshJs, /drawDeviceIconSvgV1/);
    assert.match(pinMeshJs, /0x2563eb/);
    assert.match(pinMeshJs, /0x16a34a/);
    assert.match(pinMeshJs, /0xea580c|0xf59e0b/);
    assert.match(pinMeshJs, /0x7c3aed|0xa855f7/);
    assert.match(pinMeshJs, /0xeab308/);
    assert.match(pinMeshJs, /castShadow/);
    assert.match(pinMeshJs, /shadowDisk|CircleGeometry/);
    assert.doesNotMatch(pinMeshJs, /emoji:\s*"/);
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
    assert.match(lightJs, /alert-beacon/);
    assert.match(lightJs, /my-1f-katte/);
    assert.match(lightJs, /\\uFEFF/);
    assert.match(lightJs, /TislySecurityIso3d/);
    assert.match(lightJs, /setOrbitEnabled|onIso3d/);
    assert.match(lightJs, /touches\.length\s*===\s*2|cancelDrumForPinch/);
    assert.doesNotMatch(lightJs, /sf-cam-thumbs|sf-live-feed|setLive\(/);
    assert.match(orbitJs, /rotateX/);
    assert.match(orbitJs, /drum-r/);
    assert.match(orbitJs, /__TISLY_SF_ORBIT_BOUND/);
    assert.match(orbitJs, /TislySecurityIso3d/);
    assert.match(orbitJs, /touches\.length\s*===\s*2|cancelDrumForPinch/);
    assert.match(orbitJs, /capture:\s*true/);
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
    assert.match(opJs, /updateSecurityIso3d/);
    assert.match(opJs, /sf-log-compact|logIconFor/);
    assert.match(opJs, /sf-log-dialog|sf-log-open-detail/);
    assert.match(opJs, /\\uFEFF/);
    assert.match(opJs, /startAlarmPolling|alarmSignature|refreshLiveAlarms/);
    assert.match(opJs, /【発報中】/);
    assert.match(opJs, /発報中/);
    assert.match(opJs, /sf-demo-alert|toggleLivingAlert/);
    assert.match(opJs, /sf-ack|ackAlarms/);
    assert.match(opJs, /ネットワーク遅延|稼働ステータス|最新ハートビート/);
    assert.match(opJs, /formatHeartbeatAt|lastHeartbeatAt|deviceOnline/);
    assert.doesNotMatch(opJs, /消費電力|スマート照明/);
    assert.doesNotMatch(opJs, /setLiveScene|renderThumbs|sf-cam-thumbs/);
    const fbJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-fallback-v1.js"
      ),
      "utf8"
    );
    assert.match(fbJs, /SEC-JP-MORIYA-001/);
    assert.match(fbJs, /SEC-JP-ITABASHI-LIVE/);
    assert.match(fbJs, /勝手口キッチン/);
    assert.match(fbJs, /平屋デモ宅/);
    assert.match(fbJs, /つくばモデルハウス/);
    assert.match(fbJs, /板橋自宅/);
    assert.doesNotMatch(fbJs, /屋根\/太陽光/);
    assert.doesNotMatch(fbJs, /美園の家/);
    const customerHtml = fs.readFileSync(
      path.join(publicDir, "security-customer-v1.html"),
      "utf8"
    );
    assert.doesNotMatch(customerHtml, /sf-cam-expand|sf-live-feed|ライブカメラ|カメラを表示/);
    assert.match(customerHtml, /TiSLY Security/);
    assert.match(customerHtml, /href="\/customer"/);
    assert.match(customerHtml, /security-floor-light-v1\.js/);
    assert.match(customerHtml, /security-floor-iso3d-v1\.js/);
    assert.match(customerHtml, /security-floor-push-v1\.js/);
    assert.match(customerHtml, /sf-push-reregister/);
    assert.match(customerHtml, /sf-push-diag/);
    assert.match(customerHtml, /Push通知を再登録・購読/);
    assert.match(customerHtml, /sf-iso3d-mount/);
    assert.match(customerHtml, /sf-iso3d-stack/);
    assert.match(customerHtml, /sf-log-compact/);
    assert.match(customerHtml, /sf-demo-alert/);
    assert.match(customerHtml, /data-room-id="my-1f-katte"/);
    assert.match(customerHtml, /data-focus="1f"/);
    assert.doesNotMatch(customerHtml, /読み込み中/);
    assert.doesNotMatch(customerHtml, /home-quick-switch/);

    const opHtml = fs.readFileSync(
      path.join(publicDir, "security-v1.html"),
      "utf8"
    );
    assert.match(opHtml, /sf-push-reregister/);
    assert.match(opHtml, /sf-push-diag/);
    assert.match(opHtml, /Push通知を再登録・購読/);
    assert.match(opHtml, /security-floor-push-v1\.js/);
    assert.match(opHtml, /permission: — \/ standalone: — \/ appleAPNs: —/);

    const pushJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-push-v1.js"
      ),
      "utf8"
    );
    assert.match(pushJs, /forceResubscribe/);
    assert.match(pushJs, /\/api\/notifications\/subscribe/);
    assert.match(pushJs, /appleAPNs/);

    const remoteJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-remote-config-v1.js"
      ),
      "utf8"
    );
    assert.match(remoteJs, /SEC-JP-ITABASHI-LIVE/);
    assert.match(remoteJs, /HOME-JP-ITABASHI-LIVE/);
    assert.match(remoteJs, /applyGuardModeImmediate/);
    assert.match(remoteJs, /securityPausedUntil/);

    const itabashi = buildSecurityFloorOperatorSiteV1("SEC-JP-ITABASHI-LIVE");
    assert.ok(itabashi.soc);
    assert.equal(typeof itabashi.soc.deviceOnline, "boolean");
    assert.ok(
      itabashi.soc.lastHeartbeatAt === null ||
        typeof itabashi.soc.lastHeartbeatAt === "string"
    );

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
      (s: { id: string }) => s.id === "my-door-katte"
    );
    assert.equal(door.alertVisible, true);
    assert.equal(door.state, "alert");
    const katteRoom = notifyMoriya.body.operatorSite.rooms.find(
      (r: { id: string }) => r.id === "my-1f-katte"
    );
    assert.equal(katteRoom.alertVisible, true);
  });

  it("mirrors HOME DI1/DI2 events into Security Floor open alarms", async () => {
    const { resetHomeSecurityNotifyStateV1 } = await import(
      "../src/home/home-security-notify-v1.js"
    );
    resetHomeSecurityNotifyStateV1("HOME-JP-ITABASHI-LIVE");
    ackSecurityAlarmsV1("SEC-JP-ITABASHI-LIVE");

    const di2 = recordHomeDiSecurityAlarmV1({
      homeSiteId: "HOME-JP-ITABASHI-LIVE",
      di: 2,
      pattern: "pattern_c",
    });
    assert.match(di2.kindLabel, /ガレージセンサー検知/);
    assert.equal(di2.status, "open");

    const site = buildSecurityFloorOperatorSiteV1("SEC-JP-ITABASHI-LIVE");
    assert.equal(site.hasAlert, true);
    const open = (site.soc.alarmLogs || []).filter(
      (l: { status: string }) => l.status !== "done"
    );
    assert.ok(open.length >= 1);
    assert.match(open[0].kindLabel, /ガレージセンサー検知/);

    const event = await request(app)
      .post("/api/home/v1/security/event")
      .send({ siteId: "HOME-JP-ITABASHI-LIVE", di: 1 });
    assert.equal(event.status, 200);

    const afterDi1 = buildSecurityFloorOperatorSiteV1("SEC-JP-ITABASHI-LIVE");
    const openAfter = (afterDi1.soc.alarmLogs || []).filter(
      (l: { status: string }) => l.status !== "done"
    );
    assert.ok(
      openAfter.some((l: { kindLabel: string }) =>
        /駐車場センサー検知/.test(l.kindLabel)
      )
    );

    const ack = await request(app)
      .post("/api/security-floor/v1/alarm-ack")
      .send({ siteId: "SEC-JP-ITABASHI-LIVE" });
    assert.equal(ack.status, 200);
    assert.equal(ack.body.operatorSite.hasAlert, false);
    const cleared = (ack.body.operatorSite.soc.alarmLogs || []).filter(
      (l: { status: string }) => l.status !== "done"
    );
    assert.equal(cleared.length, 0);
  });
});
