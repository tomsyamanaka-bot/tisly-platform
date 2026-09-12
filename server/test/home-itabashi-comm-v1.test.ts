import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-itabashi-comm-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-home-itabashi-comm-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  buildItabashiStatusSsotV1,
  recordItabashiHeartbeatV1,
  resetItabashiCommForTestV1,
  setItabashiHeartbeatAtForTestV1,
  setItabashiHeartbeatWatchV1,
} = await import("../src/home/home-itabashi-comm-v1.js");
const { loadToyoshimaHeartbeatStoreV1 } = await import(
  "../src/home/home-toyoshima-heartbeat-store-v1.js"
);
const { HOME_ITABASHI_LIVE_SITE_ID_V1 } = await import(
  "../src/home/home-sites-v1.js"
);
const { HOME_JP_TOYOSHIMA_SITE_ID_V1 } = await import(
  "../src/home/home-toyoshima-security-v1.js"
);
const { buildCustomerSessionHomeV1 } = await import(
  "../src/shared/customer/customer-portal-data-v1.js"
);

const app = createApp();

describe("home-itabashi-comm-v1", () => {
  afterEach(() => {
    resetItabashiCommForTestV1();
  });

  after(() => {
    closeDatabase();
  });

  it("empty temp shows 取得中 without a fake value", () => {
    resetItabashiCommForTestV1();
    const ssot = buildItabashiStatusSsotV1();
    assert.equal(ssot.ssot, "itabashi-commHealth");
    assert.equal(ssot.siteId, HOME_ITABASHI_LIVE_SITE_ID_V1);
    assert.equal(ssot.boardTempC, null);
    assert.equal(ssot.boardTempLabel, "―（取得中）");
    assert.equal(ssot.uiOnline, false);
    assert.match(ssot.operatorOnline, /通信途絶/);
  });

  it("sim heartbeat 36.2C paints 適温・正常 and stays online", () => {
    const ssot = recordItabashiHeartbeatV1({
      boardTemp: 36.2,
      deviceId: "sim-itabashi-main",
    });
    assert.equal(ssot.boardTempC, 36.2);
    assert.equal(ssot.boardTempLabel, "36.2℃（適温・正常）");
    assert.equal(ssot.isHardwareOnline, true);
    assert.match(ssot.operatorOnline, /正常稼働中（オンライン）/);
    assert.match(ssot.customerOnline, /正常稼働中（オンライン）/);
    assert.ok(ssot.lastHeartbeatAt);
  });

  it("does not overwrite Toyoshima heartbeat row", () => {
    const toyoshimaBefore = loadToyoshimaHeartbeatStoreV1(
      HOME_JP_TOYOSHIMA_SITE_ID_V1
    );
    recordItabashiHeartbeatV1({ boardTemp: 36.2 });
    const toyoshimaAfter = loadToyoshimaHeartbeatStoreV1(
      HOME_JP_TOYOSHIMA_SITE_ID_V1
    );
    assert.deepEqual(toyoshimaAfter, toyoshimaBefore);
    const itabashi = loadToyoshimaHeartbeatStoreV1(
      HOME_ITABASHI_LIVE_SITE_ID_V1
    );
    assert.equal(itabashi?.siteId, HOME_ITABASHI_LIVE_SITE_ID_V1);
    assert.equal(itabashi?.main.boardTempC, 36.2);
  });

  it("caution and warning labels match Toyoshima thresholds", () => {
    const caution = recordItabashiHeartbeatV1({ boardTemp: 48.2 });
    assert.equal(caution.boardTempLevel, "caution");
    assert.match(caution.boardTempLabel, /注意/);
    const warn = recordItabashiHeartbeatV1({ boardTemp: 62.5 });
    assert.equal(warn.boardTempLevel, "warning");
    assert.match(warn.boardTempLabel, /警告/);
  });

  it("stale heartbeat over 5 minutes is offline", () => {
    recordItabashiHeartbeatV1({ boardTemp: 36.2 });
    const stale = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
    setItabashiHeartbeatAtForTestV1(stale, 36.2);
    const ssot = buildItabashiStatusSsotV1();
    assert.equal(ssot.uiOnline, false);
    assert.equal(ssot.isHardwareOnline, false);
    assert.match(ssot.customerOnline, /オフライン（通信途絶）/);
  });

  it("watch toggle only updates Itabashi ops config", () => {
    const off = setItabashiHeartbeatWatchV1(false);
    assert.equal(off.heartbeatWatchEnabled, false);
    const on = setItabashiHeartbeatWatchV1(true);
    assert.equal(on.heartbeatWatchEnabled, true);
  });

  it("TOMS001 session home overlays board temp and version", () => {
    resetItabashiCommForTestV1();
    const empty = buildCustomerSessionHomeV1("TOMS001");
    assert.equal(empty.liveStatusSite, "itabashi");
    assert.equal(empty.liveStatusSsot, true);
    assert.equal(empty.boardTempLabel, "―（取得中）");
    recordItabashiHeartbeatV1({ boardTemp: 36.2 });
    const live = buildCustomerSessionHomeV1("TOMS001");
    assert.match(String(live.boardTempLabel), /36\.2℃（適温・正常）/);
    assert.ok(live.firmwareLabel);
  });

  it("GET status and POST heartbeat APIs return SSOT", async () => {
    resetItabashiCommForTestV1();
    const empty = await request(app).get("/api/home/v1/itabashi/status");
    assert.equal(empty.status, 200);
    assert.equal(empty.body.ssot, "itabashi-commHealth");
    assert.equal(empty.body.boardTempLabel, "―（取得中）");

    const posted = await request(app)
      .post("/api/home/v1/itabashi/heartbeat")
      .send({ boardTemp: 36.2, deviceId: "sim-itabashi-main" });
    assert.equal(posted.status, 200);
    assert.equal(posted.body.ok, true);
    assert.equal(posted.body.message, "最新の接続状態を取得しました");
    assert.equal(posted.body.status.boardTempLabel, "36.2℃（適温・正常）");

    const watch = await request(app)
      .put("/api/home/v1/itabashi/config")
      .send({ heartbeatWatchEnabled: false });
    assert.equal(watch.status, 200);
    assert.equal(watch.body.config.heartbeatWatchEnabled, false);
  });
});
