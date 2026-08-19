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

  it("surveyor hub includes practicalApps cards", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(res.status, 200);
    const apps = res.body.practicalApps || [];
    assert.ok(apps.length >= 6);
    const schedule = apps.find((a: { id: string }) => a.id === "schedule_v1");
    const survey = apps.find((a: { id: string }) => a.id === "survey_v1");
    const estimate = apps.find((a: { id: string }) => a.id === "estimate_v1");
    assert.equal(schedule?.status, "ready");
    assert.equal(survey?.status, "ready");
    assert.equal(estimate?.status, "ready");
    const work = apps.find((a: { id: string }) => a.id === "work_report");
    assert.equal(work?.status, "coming_soon");
    assert.equal(work?.statusLabel, "準備中");
    const knowledge = apps.find((a: { id: string }) => a.id === "knowledge_module_v1");
    assert.equal(knowledge?.status, "ready");
    assert.equal(knowledge?.statusLabel, "使えます");
    assert.equal(knowledge?.url, "/knowledge-module-v1");
    const printViewer = apps.find((a: { id: string }) => a.id === "print_model_viewer_v1");
    assert.equal(printViewer?.status, "ready");
    assert.equal(printViewer?.url, "/print-model-viewer");
    const ecoWater = apps.find((a: { id: string }) => a.id === "eco_water_v1");
    assert.equal(ecoWater?.status, "ready");
    assert.equal(ecoWater?.url, "/eco-water-v1");
  });

  it("installer hub shows install only", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 200);
    const ids = res.body.apps.map((a: { id: string }) => a.id);
    assert.deepEqual(ids, ["installer"]);
  });

  it("surveyor hub shows survey and business", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(res.status, 200);
    const ids = res.body.apps.map((a: { id: string }) => a.id);
    assert.deepEqual(ids, ["schedule_v1", "survey_v1", "estimate_v1", "survey", "business"]);
  });

  it("admin hub shows all PWAs", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const ids = res.body.apps.map((a: { id: string }) => a.id);
    assert.ok(ids.includes("installer"));
    assert.ok(ids.includes("survey"));
    assert.ok(ids.includes("pro_remote"));
    assert.ok(ids.includes("maintenance"));
    assert.ok(ids.includes("customer_portal"));
    assert.ok(ids.includes("admin"));
    assert.ok(ids.includes("business"));
    assert.ok(ids.includes("schedule_v1"));
    assert.ok(ids.includes("survey_v1"));
    assert.ok(ids.includes("estimate_v1"));
    assert.equal(ids.length, 10);
  });

  it("admin hub shows notification menu links", async () => {
    const res = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const ids = (res.body.notifications || []).map((n: { id: string }) => n.id);
    assert.deepEqual(ids, ["notification_center", "push_register", "notification_test"]);
    const hrefs = (res.body.notifications || []).map((n: { href: string }) => n.href);
    assert.ok(hrefs.includes("/app/notifications"));
    assert.ok(hrefs.includes("/app/push"));
    assert.ok(hrefs.includes("/app/push#notification-test"));
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
