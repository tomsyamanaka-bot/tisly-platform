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
    assert.match(css, /#1e3a8a/i);
    assert.match(css, /ew-valve-blink/);
    assert.match(js, /window\.print/);
    assert.match(sim, /ECO_WATER_ALKALINE_PH/);
  });

  it("simulates alkaline spike then neutralize to safe discharge", () => {
    let state = createEcoWaterSimStateV1();
    assert.equal(resolvePhStatusLabelV1(state.ph).kind, "safe");
    state = applyAlkalineSpikeV1(state);
    assert.equal(state.ph, 12.3);
    assert.equal(resolvePhStatusLabelV1(state.ph).label, "危険・アルカリ性");
    state = startNeutralizeV1(state);
    assert.equal(state.valveOpen, true);
    for (let i = 0; i < 80 && state.phase !== "complete"; i += 1) {
      state = stepNeutralizeV1(state, 0.3);
    }
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
});
