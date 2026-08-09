import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = "test-jwt-eco-water-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-eco-water-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");
const {
  applyAlkalineSpikeV1,
  buildCertificatePayloadV1,
  createEcoWaterSimStateV1,
  resolvePhStatusLabelV1,
  startNeutralizeV1,
  stepNeutralizeV1,
} = await import("../src/eco-water/eco-water-sim-v1.js");
const {
  ECO_WATER_DEFAULT_SITE_ID_V1,
  ECO_WATER_SITES_V1,
  findEcoWaterSiteV1,
  formatEcoWaterHashIdV1,
  listEcoWaterSitesV1,
} = await import("../src/eco-water/eco-water-sites-v1.js");
const {
  createNeutralizeHistoryEntryV1,
  loadNeutralizeHistoryV1,
  loadSelectedSiteIdV1,
  prependNeutralizeHistoryV1,
  saveNeutralizeHistoryV1,
  saveSelectedSiteIdV1,
} = await import("../src/eco-water/eco-water-history-v1.js");
const { buildPracticalHubCards } = await import("../src/pwa/pwa-hub.js");
const { buildCustomerHomeStateV1 } = await import(
  "../src/shared/customer/customer-home-state-v1.js"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");
const app = createApp();

describe("TiSLY Eco-Water v1", () => {
  before(() => {
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
  });

  after(() => closeDatabase());

  it("serves eco-water pages on app and customer routes", async () => {
    for (const url of ["/eco-water-v1", "/app/eco-water", "/customer/eco-water"]) {
      const res = await request(app).get(url);
      assert.equal(res.status, 200, url);
      assert.match(res.text, /TiSLY Eco-Water/);
      assert.match(res.text, /アルカリ排水自動中和/);
      assert.match(res.text, /ew-btn-alkaline/);
      assert.match(res.text, /ew-btn-neutralize/);
      assert.match(res.text, /水質安全証明書/);
      assert.match(res.text, /センサ定例校正ステータス/);
      assert.match(res.text, /Modbus-RTU/);
      assert.match(res.text, /eco-water-v1\.js/);
      assert.match(res.text, /chart\.js/);
    }
  });

  it("keeps feature assets and required UI markers", () => {
    const html = fs.readFileSync(path.join(publicDir, "eco-water-v1.html"), "utf8");
    const css = fs.readFileSync(
      path.join(publicDir, "css/features/eco-water/eco-water-v1.css"),
      "utf8"
    );
    const js = fs.readFileSync(
      path.join(publicDir, "js/features/eco-water/eco-water-v1.js"),
      "utf8"
    );
    const sim = fs.readFileSync(
      path.join(publicDir, "js/features/eco-water/eco-water-sim-v1.js"),
      "utf8"
    );
    assert.match(html, /【デモ】アルカリ水投入（pH 12\.3）/);
    assert.match(html, /【デモ】自動中和スタート/);
    assert.match(html, /改ざん防止ハッシュID/);
    assert.match(html, /発行日/);
    assert.match(html, /ew-cert-issued/);
    assert.match(html, /ConoHa VPS Cloud連動正常/);
    assert.match(html, /対象現場切替/);
    assert.match(html, /筑波解体現場 \/ 水処理槽 B/);
    assert.match(html, /土浦食品工場 \/ 苛性洗浄排水ピット/);
    assert.match(html, /最近の自動中和実行ログ/);
    assert.match(html, /ew-history-list/);
    assert.doesNotMatch(html, /さくらVPS/);
    assert.match(css, /#1e3a8a/i);
    assert.match(css, /ew-valve-blink/);
    assert.match(css, /#2563eb/);
    assert.match(css, /@media print/);
    assert.match(css, /max-height:\s*100vh/);
    assert.match(css, /overflow:\s*hidden/);
    assert.match(css, /page-break-after:\s*avoid/);
    assert.match(css, /break-after:\s*avoid/);
    assert.match(css, /break-all/);
    assert.match(css, /ew-site-select/);
    assert.match(css, /ew-history-item/);
    assert.match(js, /window\.print/);
    assert.match(js, /refreshCertificateIssuedAtV1/);
    assert.match(js, /resolveCertificateMeasuredAtV1/);
    assert.match(js, /prependNeutralizeHistoryV1/);
    assert.match(js, /localStorage/);
    assert.match(js, /formatEcoWaterHashIdV1/);
    assert.match(sim, /ECO_WATER_ALKALINE_PH/);
    assert.ok(
      fs.existsSync(
        path.join(publicDir, "js/features/eco-water/eco-water-sites-v1.js")
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(publicDir, "js/features/eco-water/eco-water-history-v1.js")
      )
    );
  });

  it("lists three demo sites and switches meta fields", () => {
    const sites = listEcoWaterSitesV1();
    assert.equal(sites.length, 3);
    assert.equal(sites[0].id, ECO_WATER_DEFAULT_SITE_ID_V1);
    assert.match(sites[0].siteName, /守谷生コンプラント/);
    assert.match(sites[1].siteName, /筑波解体現場/);
    assert.match(sites[2].siteName, /土浦食品工場/);
    assert.equal(ECO_WATER_SITES_V1.length, 3);

    const tkb = findEcoWaterSiteV1("tsukuba-tank-b");
    assert.equal(tkb.hashIdPrefix, "EW-TKB");
    assert.match(tkb.calibrationDate, /2026/);
    assert.equal(
      formatEcoWaterHashIdV1("abcdef0123456789ffff", "EW-TKB"),
      "EW-TKB-ABCDEF0123456789"
    );
    const fallback = findEcoWaterSiteV1("unknown-site");
    assert.equal(fallback.id, ECO_WATER_DEFAULT_SITE_ID_V1);
  });

  it("prepends neutralize history and persists via storage buffer", () => {
    /** @type {Record<string, string>} */
    const mem: Record<string, string> = {};
    const storage = {
      getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(mem, key)
          ? mem[key]
          : null;
      },
      setItem(key: string, value: string) {
        mem[key] = value;
      },
    };
    const first = createNeutralizeHistoryEntryV1({
      siteId: "moriya-pit-a",
      siteName: "守谷生コンプラント / 排水ピット A",
      companyName: "株式会社TOMS",
      calibrationDate: "2026/08/01",
      phBefore: 12.3,
      phAfter: 7.2,
      hashId: "EW-MRY-AAAA",
      timestamp: "2026/08/09 10:00:00",
      status: "放流適合",
    });
    const second = createNeutralizeHistoryEntryV1({
      siteId: "tsukuba-tank-b",
      siteName: "筑波解体現場 / 水処理槽 B",
      companyName: "株式会社TOMS",
      calibrationDate: "2026/07/28",
      phBefore: 12.3,
      phAfter: 7.2,
      hashId: "EW-TKB-BBBB",
      timestamp: "2026/08/09 11:00:00",
      status: "完了",
    });
    let list = prependNeutralizeHistoryV1([], first);
    list = prependNeutralizeHistoryV1(list, second);
    assert.equal(list.length, 2);
    assert.equal(list[0].hashId, "EW-TKB-BBBB");
    assert.equal(list[1].hashId, "EW-MRY-AAAA");
    saveNeutralizeHistoryV1(storage, list);
    saveSelectedSiteIdV1(storage, "tsuchiura-caustic");
    const loaded = loadNeutralizeHistoryV1(storage);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].siteName, second.siteName);
    assert.equal(
      loadSelectedSiteIdV1(storage, ECO_WATER_DEFAULT_SITE_ID_V1),
      "tsuchiura-caustic"
    );
  });

  it("simulates alkaline spike then neutralize to safe discharge", () => {
    let state = createEcoWaterSimStateV1();
    assert.equal(resolvePhStatusLabelV1(state.ph).kind, "safe");
    state = applyAlkalineSpikeV1(state);
    assert.equal(state.ph, 12.3);
    assert.equal(resolvePhStatusLabelV1(state.ph).label, "危険・アルカリ性");
    state = startNeutralizeV1(state);
    assert.equal(state.valveOpen, true);
    let sawValveOpenNearTarget = false;
    for (let i = 0; i < 80 && state.phase !== "complete"; i += 1) {
      state = stepNeutralizeV1(state, 0.3);
      // pH 8.0 付近でもバルブは開のまま（7.2到達まで）
      if (state.ph <= 8.2 && state.ph > 7.2) {
        assert.equal(state.valveOpen, true);
        sawValveOpenNearTarget = true;
      }
    }
    assert.equal(sawValveOpenNearTarget, true);
    assert.equal(state.phase, "complete");
    assert.equal(state.ph, 7.2);
    assert.equal(state.valveOpen, false);
    assert.equal(resolvePhStatusLabelV1(state.ph).kind, "safe");
    const payload = buildCertificatePayloadV1({
      companyName: "株式会社TOMS",
      siteName: "守谷生コンプラント",
      measuredAt: "2026/08/09 15:00:00",
      phBefore: "12.3",
      phAfter: "7.2",
      calibrationDate: "2026/08/01",
    });
    assert.match(payload, /12\.3\|7\.2/);
  });

  it("appends Eco-Water card to practical hub and customer home", async () => {
    const cards = buildPracticalHubCards("surveyor");
    const eco = cards.find((c) => c.id === "eco_water_v1");
    assert.ok(eco);
    assert.equal(eco?.status, "ready");
    assert.equal(eco?.url, "/eco-water-v1");

    const home = buildCustomerHomeStateV1({
      shareId: "demo",
      propertyName: "プラント",
    });
    const homeEco = home.cards.find((c) => c.id === "eco_water");
    assert.ok(homeEco);
    assert.equal(homeEco?.href, "/customer/eco-water");
    assert.ok(home.cards.length >= 7);

    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.surveyor",
        password: "demo-remote-2026",
      });
    assert.equal(login.status, 200);
    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(hub.status, 200);
    const hubEco = (hub.body.practicalApps || []).find(
      (a: { id: string }) => a.id === "eco_water_v1"
    );
    assert.equal(hubEco?.url, "/eco-water-v1");
  });

  it("does not strip existing practical hub cards", () => {
    const cards = buildPracticalHubCards("surveyor");
    const ids = cards.map((c) => c.id);
    assert.ok(ids.includes("survey_v1"));
    assert.ok(ids.includes("estimate_v1"));
    assert.ok(ids.includes("print_model_viewer_v1"));
    assert.ok(ids.includes("eco_water_v1"));
  });

  it("receives telemetry and returns status with certificate hash on neutralize", async () => {
    const {
      resetEcoWaterTelemetryBufferForTestsV1,
    } = await import("../src/eco-water/eco-water-telemetry-store-v1.js");
    const {
      generateEcoWaterCertificateHashV1,
      isEcoWaterNeutralCompletePhV1,
      buildEcoWaterCertCanonicalV1,
    } = await import("../src/eco-water/eco-water-cert-hash-v1.js");

    resetEcoWaterTelemetryBufferForTestsV1();

    assert.equal(isEcoWaterNeutralCompletePhV1(7.2), true);
    assert.equal(isEcoWaterNeutralCompletePhV1(7.25), true);
    assert.equal(isEcoWaterNeutralCompletePhV1(8.0), false);

    const canon = buildEcoWaterCertCanonicalV1({
      sitePrefix: "EW-TKB",
      timestamp: "2026-08-09T21:30:00Z",
      salt: "abc123",
    });
    assert.equal(canon.canonical, "EW-TKB-2026-08-09T21:30:00Z-abc123");
    assert.equal(canon.siteToken, "TKB");
    assert.equal(canon.siteKey, "EW-TKB");

    const cert = generateEcoWaterCertificateHashV1({
      sitePrefix: "EW-TKB",
      timestamp: "2026-08-09T21:30:00Z",
      salt: "fixed-salt",
      phBefore: 12.3,
      phAfter: 7.2,
    });
    assert.match(cert.hashId, /^EW-TKB-[0-9A-F]{16}$/);
    assert.equal(cert.certificateHash.length, 64);
    assert.equal(
      cert.canonical,
      "EW-TKB-2026-08-09T21:30:00Z-fixed-salt"
    );
    assert.equal(cert.salt, "fixed-salt");

    const alkaline = await request(app)
      .post("/api/eco-water/telemetry")
      .send({
        site_id: "EW-TKB",
        ph_value: 12.1,
        valve_status: "open",
        calibration_date: "2026-07-28",
        timestamp: "2026-08-09T21:29:00Z",
      });
    assert.equal(alkaline.status, 200);
    assert.equal(alkaline.body.ok, true);
    assert.equal(alkaline.body.status.ph_value, 12.1);
    assert.equal(alkaline.body.status.valve_status, "open");
    assert.equal(alkaline.body.status.neutralizeComplete, false);

    const done = await request(app)
      .post("/api/eco-water/telemetry")
      .send({
        site_id: "EW-TKB",
        ph_value: 7.2,
        valve_status: "close",
        calibration_date: "2026-07-28",
        timestamp: "2026-08-09T21:30:00Z",
      });
    assert.equal(done.status, 200);
    assert.equal(done.body.status.neutralizeComplete, true);
    assert.ok(done.body.certificateHash);
    assert.match(done.body.hashId, /^EW-TKB-/);

    const status = await request(app).get(
      "/api/eco-water/status?site_id=EW-TKB"
    );
    assert.equal(status.status, 200);
    assert.equal(status.body.status.ph_value, 7.2);
    assert.ok(status.body.status.history.length >= 2);
    assert.equal(status.body.hashId, done.body.hashId);

    const bad = await request(app)
      .post("/api/eco-water/telemetry")
      .send({ site_id: "EW-TKB", ph_value: 99 });
    assert.equal(bad.status, 400);

    const missing = await request(app).get("/api/eco-water/status");
    assert.equal(missing.status, 400);

    const html = fs.readFileSync(
      path.join(publicDir, "eco-water-v1.html"),
      "utf8"
    );
    const js = fs.readFileSync(
      path.join(publicDir, "js/features/eco-water/eco-water-v1.js"),
      "utf8"
    );
    assert.match(html, /ew-mode-live/);
    assert.match(html, /LIVE（実機）/);
    assert.match(js, /createEcoWaterLiveClientV1/);
    assert.match(js, /setLiveMode/);
    assert.ok(
      fs.existsSync(
        path.join(publicDir, "js/features/eco-water/eco-water-live-v1.js")
      )
    );
    const liveJs = fs.readFileSync(
      path.join(publicDir, "js/features/eco-water/eco-water-live-v1.js"),
      "utf8"
    );
    assert.match(liveJs, /\/api\/eco-water\/status/);
    assert.match(liveJs, /EventSource/);
  });
});
