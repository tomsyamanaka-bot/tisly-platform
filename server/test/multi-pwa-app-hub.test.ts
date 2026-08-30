import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-pwa-phase461";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-multi-pwa-hub-phase461.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");
const { PWA_SHELL_VERSION } = await import("../src/pwa/pwa-shell-version.js");
const { APP_ICON_VERSION } = await import("../src/pwa/pwa-manifest-icons.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
}

describe("Phase 461-480 multi PWA app hub", () => {
  let installerToken = "";
  let surveyorToken = "";
  let adminToken = "";

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
    resetRateLimitsForTests();
    getDatabase();
    const ti = await customerLogin("TOMS001", "toms001.installer");
    assert.equal(ti.status, 200, ti.body?.error);
    installerToken = ti.body.token;
    const ts = await customerLogin("TOMS001", "toms001.surveyor");
    assert.equal(ts.status, 200, ts.body?.error);
    surveyorToken = ts.body.token;
    const ta = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(ta.status, 200, ta.body?.error);
    adminToken = ta.body.token;
  });

  after(() => closeDatabase());

  it("serves /app hub page", async () => {
    const res = await request(app).get("/app");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("TiSLY App Hub"));
    assert.ok(res.text.includes("hub-app-grid"));
    assert.ok(res.text.includes("今日使うアプリ"));
    assert.ok(res.text.includes("tisly-practical-nav"));
  });

  it("serves schedule-v1, survey-v1 and estimate-v1 with practical nav", async () => {
    const sc = await request(app).get("/schedule-v1");
    assert.equal(sc.status, 200);
    assert.ok(sc.text.includes("日程調整"));
    const sv = await request(app).get("/survey-v1");
    assert.equal(sv.status, 200);
    assert.ok(sv.text.includes("tisly-practical-nav"));
    assert.ok(sv.text.includes("見積へ送る"));
    const es = await request(app).get("/estimate-v1");
    assert.equal(es.status, 200);
    assert.ok(es.text.includes("tisly-practical-nav"));
    assert.ok(es.text.includes("見積待ち一覧"));
  });

  it("surveyor hub includes field practicalApps only", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(res.status, 200);
    const apps = res.body.practicalApps || [];
    assert.ok(apps.length >= 10);
    const ids = apps.map((a: { id: string }) => a.id);
    assert.ok(ids.includes("floorplan_builder_v1"));
    assert.ok(ids.includes("print_generator_v1"));
    assert.ok(ids.includes("security_floor_v1"));
    assert.ok(ids.includes("tisly_home_v1"));
    assert.ok(ids.includes("schedule_v1"));
    assert.ok(ids.includes("radar_settings_v1"));
    assert.ok(ids.includes("voice_hub_v1"));
    assert.ok(ids.includes("documents_v1"));
    assert.ok(ids.includes("project_dashboard_v1"));
    assert.ok(!ids.includes("survey_v1"));
    assert.ok(!ids.includes("estimate_v1"));
    assert.ok(!ids.includes("eco_water_v1"));
    assert.ok(!ids.includes("knowledge_module_v1"));
    assert.equal(res.body.showOpsPanels, false);
    assert.equal(res.body.operations, null);
    assert.deepEqual(res.body.workflows || [], []);
    const schedule = apps.find((a: { id: string }) => a.id === "schedule_v1");
    assert.equal(schedule?.status, "ready");
    const voiceHub = apps.find((a: { id: string }) => a.id === "voice_hub_v1");
    assert.equal(voiceHub?.status, "ready");
    assert.equal(voiceHub?.url, "/voice-hub-v1");
    assert.match(String(voiceHub?.label ?? ""), /通話音声/);
    const floor = apps.find(
      (a: { id: string }) => a.id === "floorplan_builder_v1"
    );
    assert.equal(floor?.status, "ready");
    assert.match(String(floor?.label ?? ""), /3D間取り/);
    const printGen = apps.find(
      (a: { id: string }) => a.id === "print_generator_v1"
    );
    assert.equal(printGen?.status, "ready");
    assert.equal(printGen?.url, "/3d-generator");
    assert.match(String(printGen?.label ?? ""), /3Dプリンター作成/);
    // 並び: 間取り → プリンター → Security
    const floorIdx = ids.indexOf("floorplan_builder_v1");
    const printIdx = ids.indexOf("print_generator_v1");
    const secIdx = ids.indexOf("security_floor_v1");
    assert.ok(floorIdx < printIdx && printIdx < secIdx);
  });

  it("serves 3d-generator print page", async () => {
    const res = await request(app).get("/3d-generator");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("3Dプリンター作成"));
    assert.ok(res.text.includes("print-generator-v1"));
    assert.ok(res.text.includes("ワンタップ STL"));
    assert.match(res.text, /AIに言葉で指示して3D生成/);
    assert.match(res.text, /id="pg-ai-prompt"/);
    assert.match(res.text, /id="pg-ai-voice-btn"/);
    assert.match(res.text, /id="pg-ai-generate-btn"/);
    assert.match(res.text, /Revopoint スキャン重ね合わせ/);
    assert.match(res.text, /id="pg-scan-input"/);
    assert.match(res.text, /id="pg-scan-overlay-toggle"/);
  });

  it("3d-generator includes RP2350 cover template and scan overlay", async () => {
    const js = await request(app).get(
      "/js/features/print-generator/print-generator-v1.js"
    );
    assert.equal(js.status, 200);
    assert.match(js.text, /rp2350_poe_cover/);
    assert.match(js.text, /154\.2/);
    assert.match(js.text, /88\.1/);
    assert.match(js.text, /69\.5/);
    assert.match(js.text, /11\.4/);
    assert.match(js.text, /clearance/);
    assert.match(js.text, /STLLoader/);
    assert.match(js.text, /OBJLoader/);
    assert.match(js.text, /loadScanFile/);
    assert.match(js.text, /updateScanInterferenceStatus/);
    assert.match(js.text, /CH1/);
    assert.match(js.text, /PoE-LAN/);
  });

  it("3d-generator field options cost banner and explode slider", async () => {
    const page = await request(app).get("/3d-generator");
    assert.equal(page.status, 200);
    assert.match(page.text, /現場特化オプション/);
    assert.match(page.text, /id="pg-wire-hole"/);
    assert.match(page.text, /RJ45 LAN/);
    assert.match(page.text, /VVF2\.0-3C/);
    assert.match(page.text, /PF16管コネクタ/);
    assert.match(page.text, /PG9防水グランド/);
    assert.match(page.text, /0\.4mm薄肉ノックアウト/);
    assert.match(page.text, /id="pg-mount-seat"/);
    assert.match(page.text, /35mm DINレール爪/);
    assert.match(page.text, /φ10mmマグネット/);
    assert.match(page.text, /id="pg-cost-banner"/);
    assert.match(page.text, /id="pg-explode"/);
    assert.match(page.text, /分解・結合スライダー/);

    const js = await request(app).get(
      "/js/features/print-generator/print-generator-v1.js"
    );
    assert.equal(js.status, 200);
    assert.match(js.text, /WIRE_HOLE_PRESETS/);
    assert.match(js.text, /MOUNT_SEAT_PRESETS/);
    assert.match(js.text, /appendFieldFeatureTris/);
    assert.match(js.text, /estimatePrintCostV1/);
    assert.match(js.text, /updateCostBanner/);
    assert.match(js.text, /setExplodePct/);
    assert.match(js.text, /buildExplodeProxyTris/);
    assert.match(js.text, /partShell/);
  });

  it("3d-generator AI prompt script wires speech and API", async () => {
    const js = await request(app).get(
      "/js/features/print-generator/print-generator-v1.js"
    );
    assert.equal(js.status, 200);
    assert.match(js.text, /generateFromPrompt/);
    assert.match(js.text, /toggleVoiceInput/);
    assert.match(js.text, /\/api\/print-generator\/v1\/prompt-parse/);
    assert.match(js.text, /SpeechRecognition|webkitSpeechRecognition/);
    assert.match(js.text, /applyParsedParams/);
    assert.match(js.text, /holePitch/);
  });

  it("POST /api/print-generator/v1/prompt-parse extracts dims", async () => {
    const res = await request(app)
      .post("/api/print-generator/v1/prompt-parse")
      .send({
        prompt: "幅50mm、高さ30mm、M5のビス穴を2箇所あけたL字ステー",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.templateId, "sensor_l_bracket");
    assert.equal(res.body.params.base, 50);
    assert.equal(res.body.params.upright, 30);
    assert.ok(res.body.params.hole >= 5);
  });

  it("3d-generator 方眼紙はライブラリとカメラを分離", async () => {
    const res = await request(app).get("/3d-generator");
    assert.equal(res.status, 200);
    const html = res.text;
    assert.match(html, /写真から選ぶ/);
    assert.match(html, /カメラで撮影/);
    assert.match(html, /AI寸法抽出/);
    assert.match(html, /id="pg-sketch-library"/);
    assert.match(html, /id="pg-sketch-camera"[^>]*capture="environment"/);
    assert.match(html, /id="pg-sketch-clear"/);
    assert.match(html, /id="pg-sketch-thumbs"/);
    assert.match(html, /\bmultiple\b/);
    assert.match(html, /正面・側面・上からの複数枚/);
    // ライブラリ側に capture が付いていないこと
    const libraryBlock = html.match(/id="pg-sketch-library"[^>]*>/)?.[0];
    assert.ok(libraryBlock);
    assert.equal(libraryBlock.includes("capture"), false);
    // 旧・単一 input / 単一 img は残さない
    assert.equal(html.includes('id="pg-sketch-input"'), false);
    assert.equal(html.includes('id="pg-sketch-img"'), false);
  });

  it("3d-generator マルチスケッチ抽出スクリプト", async () => {
    const js = await request(app).get(
      "/js/features/print-generator/print-generator-v1.js"
    );
    assert.equal(js.status, 200);
    assert.match(js.text, /SKETCH_MAX\s*=\s*4/);
    assert.match(js.text, /addSketchFiles/);
    assert.match(js.text, /removeSketchById/);
    assert.match(js.text, /\/api\/print-generator\/v1\/sketch-extract/);
    assert.match(js.text, /pg-sketch-thumb-remove/);
    assert.match(js.text, /fallbackLocalMultiSketchEstimate/);
  });

  it("POST /api/print-generator/v1/sketch-extract accepts multi images", async () => {
    const tiny = Buffer.from("x".repeat(48)).toString("base64");
    const res = await request(app)
      .post("/api/print-generator/v1/sketch-extract")
      .send({
        images: [
          { dataUrl: `data:image/png;base64,${tiny}` },
          { dataUrl: `data:image/png;base64,${tiny}ab` },
        ],
        imageMetas: [
          { width: 900, height: 600 },
          { width: 700, height: 700 },
        ],
        hintText: "L字ステー",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.imageCount, 2);
    assert.equal(res.body.maxImages, 4);
    assert.ok(res.body.params);
    assert.ok(Object.keys(res.body.params).length > 0);
  });

  it("3d-generator 寸法ナンバリング連動アセット", async () => {
    const page = await request(app).get("/3d-generator");
    assert.equal(page.status, 200);
    assert.match(page.text, /①〜④を動かすと3D番号も連動/);

    const js = await request(app).get(
      "/js/features/print-generator/print-generator-v1.js"
    );
    assert.equal(js.status, 200);
    assert.match(js.text, /CSS2DRenderer/);
    assert.match(js.text, /CSS2DObject/);
    assert.match(js.text, /circledNumber/);
    assert.match(js.text, /pg-dim-index/);
    assert.match(js.text, /pg-dim-badge/);
    assert.match(js.text, /setActiveDimKey/);
    assert.match(js.text, /rebuildDimGuides/);
    assert.match(js.text, /buildDimGuides/);
    assert.ok(js.text.includes("底辺"));
    assert.ok(js.text.includes("立上り"));

    const css = await request(app).get(
      "/css/features/print-generator/print-generator-v1.css"
    );
    assert.equal(css.status, 200);
    assert.match(css.text, /\.pg-dim-index/);
    assert.match(css.text, /\.pg-dim-badge/);
    assert.match(css.text, /\.pg-dim-badge\.is-active/);
    assert.match(css.text, /#1e3a8a|--pg-navy/);
  });

  it("installer hub field apps omit legacy catalog cards", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.apps || [], []);
    const ids = (res.body.practicalApps || []).map(
      (a: { id: string }) => a.id
    );
    assert.ok(ids.includes("device_binding_v1"));
    assert.ok(ids.includes("tisly_home_v1"));
  });

  it("surveyor hub omits legacy catalog apps from field hub", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.apps || [], []);
    assert.ok(
      (res.body.practicalApps || []).some(
        (a: { id: string }) => a.id === "schedule_v1"
      )
    );
  });

  it("admin hub field view hides legacy PWA catalog cards", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.apps || [], []);
    assert.equal(res.body.showOpsPanels, false);
    const ids = (res.body.practicalApps || []).map(
      (a: { id: string }) => a.id
    );
    assert.ok(ids.includes("schedule_v1"));
    assert.ok(ids.includes("security_floor_v1"));
    assert.ok(!ids.includes("admin"));
  });

  it("admin hub hides notification menu on field hub", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.notifications || [], []);
    const { buildHubNotificationLinks } = await import(
      "../src/pwa/hub-insights.js"
    );
    const links = buildHubNotificationLinks("admin");
    assert.deepEqual(
      links.map((n) => n.id),
      ["notification_center", "push_register", "notification_test"]
    );
  });

  it("installer hub hides notification menu links", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.notifications || [], []);
  });

  it("serves TiSLY logo PWA icons", async () => {
    for (const size of [64, 128, 180, 192, 256, 384, 512]) {
      const res = await request(app).get(`/icons/icon-${size}.png`);
      assert.equal(res.status, 200, `icon-${size}.png`);
      assert.ok(res.headers["content-type"]?.includes("image"));
    }
    const manifest = await request(app).get("/manifest.webmanifest");
    const sizes = (manifest.body.icons || []).map((i: { sizes: string }) => i.sizes);
    assert.ok(sizes.includes("64x64"));
    assert.ok(sizes.includes("180x180"));
    assert.ok(sizes.includes("512x512"));
    const iconSrcs = (manifest.body.icons || []).map((i: { src: string }) => i.src);
    assert.ok(iconSrcs.every((s: string) => s.includes(`?v=${APP_ICON_VERSION}`)));
    const apple = await request(app).get("/apple-touch-icon.png");
    assert.equal(apple.status, 200);
    const hub = await request(app).get("/app");
    assert.ok(hub.text.includes("/apple-touch-icon.png"));
    assert.ok(hub.text.includes(`manifest.webmanifest?v=${APP_ICON_VERSION}`));
  });

  it("serves RC2 push and notification PWA pages", async () => {
    const push = await request(app).get("/app/push");
    assert.equal(push.status, 200);
    assert.ok(push.text.includes("btn-push-register"));
    assert.ok(push.text.includes("status-sw-registration"));
    assert.ok(push.text.includes("apple-mobile-web-app-capable"));
    assert.ok(push.text.includes("ios-pwa-guide"));
    const notif = await request(app).get("/app/notifications");
    assert.equal(notif.status, 200);
    assert.ok(notif.text.includes("通知センター"));
    assert.ok(notif.text.includes("hub-notif-nav"));
  });

  it("serves PWA manifests", async () => {
    for (const path of [
      "/manifest-survey.webmanifest",
      "/manifest-maintenance.webmanifest",
      "/manifest-pro-remote.webmanifest",
      "/manifest-customer.webmanifest",
    ]) {
      const res = await request(app).get(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.body.display, "standalone");
    }
    const dyn = await request(app).get("/customer/TOMS001/manifest.webmanifest");
    assert.equal(dyn.status, 200);
    assert.ok(dyn.body.start_url.includes("/customer/TOMS001"));
    const pro = await request(app).get("/customer/TOMS001/pro-remote/manifest.webmanifest");
    assert.equal(pro.status, 200);
    assert.ok(pro.body.start_url.includes("/pro-remote"));
  });

  it("serves offline fallback and SW v461", async () => {
    const off = await request(app).get("/offline");
    assert.equal(off.status, 200);
    assert.ok(off.text.includes("オフライン"));
    const sw = await request(app).get("/service-worker.js");
    // Eco-Water 印刷修正以降は v2441（旧タグも許容）
    assert.ok(
      sw.text.includes("tisly-pwa-v2512-multi-angle-sketch") ||
      sw.text.includes("tisly-pwa-v2511-text-to-3d-prompt") ||
      sw.text.includes("tisly-pwa-v2510-home-intercom-link") ||
      sw.text.includes("tisly-pwa-v2509-smart-intercom") ||
      sw.text.includes("tisly-pwa-v2507-pmv-header-fix") ||
      sw.text.includes("tisly-pwa-v2506-pmv-back-nav") ||
      sw.text.includes("tisly-pwa-v2505-dim-number-badges") ||
      sw.text.includes("tisly-pwa-v2504-print-sketch-lib-cam") ||
      sw.text.includes("tisly-pwa-v2503-print-generator-card") ||
      sw.text.includes("tisly-pwa-v2502-field-hub-cards-restore") ||
      sw.text.includes("tisly-pwa-v2501-field-hub-clean") ||
      sw.text.includes("tisly-pwa-v2500-dashboard-compact-3d") ||
      sw.text.includes("tisly-pwa-v2471-security-drum") ||
      sw.text.includes("tisly-pwa-v2470-security-svg") ||
      sw.text.includes("tisly-pwa-v2469-security-light") ||
      sw.text.includes("tisly-pwa-v2468-soc-failsafe") ||
      sw.text.includes("tisly-pwa-v2467-soc-iso") ||
      sw.text.includes("tisly-pwa-v2466-security-floor") ||
      sw.text.includes("tisly-pwa-v2465-genre-chips") ||
      sw.text.includes("tisly-pwa-v2464-genre-chips") ||
      sw.text.includes("tisly-pwa-v2463-unified-genres") ||
      sw.text.includes("tisly-pwa-v2462-price-cost-master") ||
        sw.text.includes("tisly-pwa-v2461-home-customer-independent") ||
        sw.text.includes("tisly-pwa-v2459-home-tile-grid") ||
        sw.text.includes("tisly-pwa-v2458-home-light-intercom") ||
        sw.text.includes("tisly-pwa-v2457-tisly-home") ||
        sw.text.includes("tisly-pwa-v2456-property-register") ||
        sw.text.includes("tisly-pwa-v2452-gas-accordion-class") ||
        sw.text.includes("tisly-pwa-v2451-gas-accordion-state") ||
        sw.text.includes("tisly-pwa-v2450-gas-live-only") ||
        sw.text.includes("tisly-pwa-v2449-device-new-registration") ||
        sw.text.includes("tisly-pwa-v2441-eco-water-print-fix") ||
        sw.text.includes("tisly-pwa-v2440-eco-water-telemetry") ||
        sw.text.includes("tisly-pwa-v2439-eco-water-sites") ||
        sw.text.includes("tisly-pwa-v2438-eco-water") ||
        sw.text.includes(`tisly-pwa-v${PWA_SHELL_VERSION}-production`)
    );
    assert.ok(sw.text.includes("customer-portal.html"));
    assert.ok(sw.text.includes("/eco-water-v1"));
  });

  it("unauthorized PWA access returns 403", async () => {
    const res = await request(app)
      .get("/api/pwa/access/admin")
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes("denied"));
  });

  it("surveyor denied installer PWA access", async () => {
    const res = await request(app)
      .get("/api/pwa/access/installer")
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(res.status, 403);
  });

  it("serves maintenance and survey pages", async () => {
    const m = await request(app).get("/maintenance");
    assert.equal(m.status, 200);
    assert.ok(m.text.includes("保守 PWA") || m.text.includes("保守 Maintenance"));
    const redirect = await request(app).get("/survey").redirects(0);
    assert.equal(redirect.status, 301);
    assert.match(String(redirect.headers.location), /\/survey-v1/);
    const legacy = await request(app).get("/survey-legacy");
    assert.equal(legacy.status, 200);
    assert.ok(legacy.text.includes("案件管理") || legacy.text.includes("見積候補"));
  });

  it("serves pro-remote PWA entry", async () => {
    const res = await request(app).get("/customer/TOMS001/pro-remote");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("PRO Remote"));
    assert.ok(res.text.includes("apple-mobile-web-app-capable"));
  });
});
