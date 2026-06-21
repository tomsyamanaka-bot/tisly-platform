import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-monitoring-3d-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tisly-monitoring-3d-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  buildMonitoringDashboardV1,
  clearMonitoringAcksForTestV1,
  listMonitoringLogsV1,
  normalizeMonitoringContentV1,
  normalizeMonitoringLevelJaV1,
  ackMonitoringLogV1,
} = await import("../src/monitoring/tisly-monitoring-dashboard-v1.js");
const {
  findMonitoringDeviceV1,
  getMonitoringLayoutSiteV1,
  guessDeviceNameFromIdV1,
} = await import("../src/monitoring/tisly-monitoring-layout-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const FORBIDDEN = /192\.168\.|project-storage|QNAP|SMB|WebDAV|mock fallback|debug/i;

describe("TiSLY Monitoring 3D Dashboard V1 — layout", () => {
  it("home site has perimeter, 1f, 2f floors", () => {
    const site = getMonitoringLayoutSiteV1("DEMO-HOME-001");
    const ids = site.floors.map((f) => f.floorId);
    assert.ok(ids.includes("perimeter"));
    assert.ok(ids.includes("1f"));
    assert.ok(ids.includes("2f"));
  });

  it("finds entrance door sensor on 1f", () => {
    const dev = findMonitoringDeviceV1("DEMO-HOME-001", "door-entrance-01");
    assert.ok(dev);
    assert.equal(dev?.deviceName, "玄関ドアセンサー");
    assert.equal(dev?.deviceType, "door");
  });

  it("finds back door sensor on 1f", () => {
    const dev = findMonitoringDeviceV1("DEMO-HOME-001", "door-back-01");
    assert.ok(dev);
    assert.equal(dev?.areaName, "勝手口");
  });

  it("plant site resolves separately", () => {
    const site = getMonitoringLayoutSiteV1("DEMO-PLANT-001");
    assert.equal(site.siteKind, "plant");
    assert.ok(site.floors.length >= 2);
  });
});

describe("TiSLY Monitoring 3D Dashboard V1 — log normalization", () => {
  it("maps alert/alarm to 侵入警報", () => {
    assert.equal(normalizeMonitoringLevelJaV1("alarm"), "侵入警報");
    assert.equal(normalizeMonitoringLevelJaV1("alert"), "侵入警報");
    assert.equal(normalizeMonitoringLevelJaV1("critical"), "侵入警報");
  });

  it("maps warning to 警報", () => {
    assert.equal(normalizeMonitoringLevelJaV1("warning"), "警報");
  });

  it("maps info/event to 情報", () => {
    assert.equal(normalizeMonitoringLevelJaV1("info"), "情報");
    assert.equal(normalizeMonitoringLevelJaV1("event"), "情報");
  });

  it("converts UNKNOWN content to 通知イベント", () => {
    assert.equal(normalizeMonitoringContentV1("UNKNOWN", null, "event"), "通知イベント");
    assert.equal(normalizeMonitoringContentV1("event", null, "event"), "通知イベント");
  });

  it("guesses device name from deviceId", () => {
    assert.equal(guessDeviceNameFromIdV1("xyz-unknown-999"), "未登録機器");
    assert.equal(guessDeviceNameFromIdV1("foo-cam-bar"), "カメラ");
  });
});

describe("TiSLY Monitoring 3D Dashboard V1 — dashboard API", () => {
  it("GET /api/monitoring/v1/dashboard returns floors and logs", async () => {
    const res = await request(app).get("/api/monitoring/v1/dashboard?siteId=DEMO-HOME-001");
    assert.equal(res.status, 200);
    assert.ok(res.body.site.floors.length >= 3);
    assert.ok(Array.isArray(res.body.recentLogs));
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/monitoring/v1/logs supports card/table data fields", async () => {
    const res = await request(app).get("/api/monitoring/v1/logs?siteId=DEMO-HOME-001&limit=5");
    assert.equal(res.status, 200);
    const log = res.body.logs[0];
    if (log) {
      assert.ok(log.timestamp);
      assert.ok(log.level);
      assert.ok(log.floorName);
      assert.ok(log.deviceName);
      assert.ok(log.content);
    }
  });

  it("POST ack marks log as acked", async () => {
    clearMonitoringAcksForTestV1();
    const dash = buildMonitoringDashboardV1("DEMO-HOME-001");
    const first = dash.recentLogs[0];
    if (!first) return;
    ackMonitoringLogV1(first.id);
    const acked = listMonitoringLogsV1("DEMO-HOME-001", "acked", 10);
    assert.ok(acked.some((l) => l.id === first.id));
  });
});

describe("TiSLY Monitoring 3D Dashboard V1 — static pages", () => {
  it("3D page is served", async () => {
    const res = await request(app).get("/tisly-monitoring-3d-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /mon3d-floor-stack/);
    assert.match(res.text, /Security Command Center/);
    assert.match(res.text, /data-ui-version="v2"/);
    assert.doesNotMatch(res.text, /\/api\/monitoring\/v1\/dashboard\?/);
  });

  it("home alias redirects to home siteId", async () => {
    const res = await request(app).get("/tisly-monitoring-home-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /DEMO-HOME-001/);
  });

  it("plant alias redirects to plant siteId", async () => {
    const res = await request(app).get("/tisly-monitoring-plant-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /DEMO-PLANT-001/);
  });

  it("CSS includes mobile bottom nav and V2 disaster log", () => {
    const css = fs.readFileSync(path.join(publicDir, "css/tisly-monitoring-3d-v1.css"), "utf8");
    assert.match(css, /mon3d-bottom-nav/);
    assert.match(css, /max-width:\s*768px/);
    assert.match(css, /mon3d-disaster-table/);
    assert.match(css, /mon3d-alert-ring/);
    assert.match(css, /mon3d-tv/);
  });

  it("JS includes floor architecture and disaster log view", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-monitoring-3d-v1.js"), "utf8");
    assert.match(js, /scrollIntoView/);
    assert.match(js, /is-blink/);
    assert.match(js, /buildArchitecture/);
    assert.match(js, /mon3d-alert-ring/);
    assert.match(js, /disasterRowClass/);
    assert.match(js, /tisly-monitoring-layout-v1/);
    assert.doesNotMatch(js, FORBIDDEN);
  });
});

after(() => {
  closeDatabase();
});
