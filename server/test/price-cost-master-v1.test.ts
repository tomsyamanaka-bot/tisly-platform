import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = "test-jwt-price-cost-master-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-price-cost-master-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";
process.env.PRICE_COST_MASTER_DATA_DIR =
  "./data/test-price-cost-master-store-v1";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import(
  "../src/security/rate-limit.js"
);
const { buildPracticalHubCards } = await import("../src/pwa/pwa-hub.js");
const {
  PRICE_COST_MASTER_LABOR_SEED_V1,
  PRICE_COST_MASTER_PARTS_SEED_V1,
  PRICE_COST_MASTER_SEED_V1,
  PRICE_COST_MASTER_SUBS_SEED_V1,
} = await import(
  "../src/price-cost-master/price-cost-master-seed-v1.js"
);
const {
  PRICE_COST_MASTER_GENRE_LABOR_SEED_V1,
  PRICE_COST_MASTER_GENRE_PARTS_SEED_V1,
} = await import(
  "../src/price-cost-master/price-cost-master-genre-seed-v1.js"
);
const {
  TISLY_UNIFIED_GENRES_V1,
} = await import("../src/shared/genres/tisly-genres-v1.js");
const {
  enrichPriceCostItemV1,
  queryPriceCostMasterV1,
} = await import("../src/price-cost-master/price-cost-master-v1.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");
const app = createApp();

async function surveyorLogin() {
  return request(app).post("/api/auth/customer/login").send({
    customerCode: "TOMS001",
    username: "toms001.surveyor",
    password: "demo-remote-2026",
  });
}

describe("Price & Cost Master v1", () => {
  let token = "";
  const storeDir = path.resolve(
    process.env.PRICE_COST_MASTER_DATA_DIR!
  );

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* keep going */
      }
    }
    fs.rmSync(storeDir, { recursive: true, force: true });
    resetRateLimitsForTests();
    getDatabase();
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => {
    closeDatabase();
    fs.rmSync(storeDir, { recursive: true, force: true });
  });

  it("keeps initial seed counts and prices", () => {
    assert.equal(PRICE_COST_MASTER_PARTS_SEED_V1.length, 4);
    assert.equal(PRICE_COST_MASTER_SUBS_SEED_V1.length, 2);
    assert.equal(PRICE_COST_MASTER_LABOR_SEED_V1.length, 3);
    assert.ok(PRICE_COST_MASTER_SEED_V1.length >= 9);
    assert.equal(PRICE_COST_MASTER_GENRE_PARTS_SEED_V1.length, 16);
    assert.equal(PRICE_COST_MASTER_GENRE_LABOR_SEED_V1.length, 8);
    const tx = PRICE_COST_MASTER_PARTS_SEED_V1.find(
      (i) => i.id === "PCM-PART-PH-TX-001"
    );
    assert.equal(tx?.costPrice, 18436);
    assert.equal(tx?.sellPrice, 32000);
    const lite = PRICE_COST_MASTER_SUBS_SEED_V1.find(
      (i) => i.id === "PCM-SUB-EW-LITE-001"
    );
    assert.equal(lite?.sellPrice, 3300);
    assert.equal(lite?.profitAmount, 2800);
  });

  it("computes profit for parts and subscriptions", () => {
    const tx = enrichPriceCostItemV1(
      PRICE_COST_MASTER_PARTS_SEED_V1[0]
    );
    assert.equal(tx.profitAmount, 13564);
    assert.equal(tx.costUnknown, false);
    const lite = enrichPriceCostItemV1(
      PRICE_COST_MASTER_SUBS_SEED_V1[0]
    );
    assert.equal(lite.profitAmount, 2800);
    assert.equal(lite.costPrice, 500);
    const labor = enrichPriceCostItemV1(
      PRICE_COST_MASTER_LABOR_SEED_V1[0]
    );
    assert.equal(labor.sellPrice, 35000);
    assert.equal(labor.costUnknown, true);
    assert.equal(labor.profitAmount, null);
  });

  it("filters by tab, category, and search", () => {
    const parts = queryPriceCostMasterV1({ tab: "parts" });
    assert.ok(parts.items.length >= 4);
    const ph = queryPriceCostMasterV1({
      tab: "parts",
      category: "水質センサー",
    });
    assert.equal(ph.items.length, 2);
    const search = queryPriceCostMasterV1({
      tab: "parts",
      q: "Waveshare RP2350",
    });
    assert.equal(search.items.length, 1);
    assert.equal(
      search.items[0].name,
      "Waveshare RP2350 RS485制御ボード"
    );
  });

  it("filters by the 8 unified genres", () => {
    assert.equal(TISLY_UNIFIED_GENRES_V1.length, 8);
    assert.ok(TISLY_UNIFIED_GENRES_V1.includes("IOT関連"));
    const iot = queryPriceCostMasterV1({
      tab: "parts",
      genre: "IOT関連",
    });
    assert.ok(iot.items.length >= 2);
    assert.ok(
      iot.items.some((i) => i.id === "PCM-PART-PH-TX-001")
    );
    assert.ok(
      iot.items.some((i) => i.id === "PCM-PART-ESP32-DEV-001")
    );
    const elec = queryPriceCostMasterV1({
      tab: "parts",
      genre: "電気工事",
    });
    assert.ok(
      elec.items.some((i) => i.id === "PCM-PART-VVF-2C-100-001")
    );
    const cam = queryPriceCostMasterV1({
      tab: "labor",
      genre: "防犯カメラ",
    });
    assert.ok(
      cam.items.some((i) => i.id === "PCM-LAB-CAM-INSTALL-001")
    );
  });

  it("serves PWA page with 3 tabs and search", async () => {
    const res = await request(app).get("/price-cost-master-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /価格・原価マスター/);
    assert.match(res.text, /材料・パーツ原価/);
    assert.match(res.text, /月額サブスクプラン/);
    assert.match(res.text, /標準工事・作業単価/);
    assert.match(res.text, /pcm-search/);
    assert.match(res.text, /price-cost-master-v1\.js/);
    const appAlias = await request(app).get("/app/price-cost-master");
    assert.equal(appAlias.status, 200);
  });

  it("returns catalog API for surveyor", async () => {
    const res = await request(app)
      .get("/api/price-cost-master/v1/catalog?tab=parts")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.items.length >= 4);
    assert.equal(res.body.genres.length, 8);
    assert.ok(res.body.genres.includes("IOT関連"));
    const names = res.body.items.map((i: { name: string }) => i.name);
    assert.ok(names.includes("RS485出力 水質pHトランスミッター"));
    assert.ok(names.includes("屋外用IP65防水制御ボックス"));
  });

  it("returns Eco-Water subscription prices", async () => {
    const res = await request(app)
      .get("/api/price-cost-master/v1?tab=subscription")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const lite = res.body.items.find(
      (i: { id: string }) => i.id === "PCM-SUB-EW-LITE-001"
    );
    assert.equal(lite.sellPrice, 3300);
    assert.equal(lite.profitAmount, 2800);
    const std = res.body.items.find(
      (i: { id: string }) => i.id === "PCM-SUB-EW-STD-001"
    );
    assert.equal(std.sellPrice, 7700);
    assert.equal(std.profitAmount, 5800);
  });

  it("returns labor standard prices", async () => {
    const res = await request(app)
      .get("/api/price-cost-master/v1/catalog?tab=labor")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length >= 3);
    const panel = res.body.items.find(
      (i: { id: string }) => i.id === "PCM-LAB-SENSOR-PANEL-001"
    );
    assert.equal(panel.sellPrice, 35000);
    assert.equal(panel.costUnknown, true);
  });

  it("registers App Hub card without replacing existing ones", () => {
    const cards = buildPracticalHubCards("surveyor");
    assert.ok(cards.some((c) => c.id === "eco_water_v1"));
    assert.ok(cards.some((c) => c.id === "tisly_home_v1"));
    assert.ok(cards.some((c) => c.id === "device_binding_v1"));
    const pcm = cards.find((c) => c.id === "price_cost_master_v1");
    assert.ok(pcm);
    assert.equal(pcm?.url, "/price-cost-master-v1");
    assert.equal(pcm?.status, "ready");
  });

  it("keeps feature assets high-contrast and append-only", () => {
    const html = fs.readFileSync(
      path.join(publicDir, "price-cost-master-v1.html"),
      "utf8"
    );
    const css = fs.readFileSync(
      path.join(
        publicDir,
        "css/features/price-cost-master/price-cost-master-v1.css"
      ),
      "utf8"
    );
    const js = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/price-cost-master/price-cost-master-v1.js"
      ),
      "utf8"
    );
    const sw = fs.readFileSync(
      path.join(publicDir, "service-worker.js"),
      "utf8"
    );
    const settings = fs.readFileSync(
      path.join(publicDir, "settings-v1.html"),
      "utf8"
    );
    assert.match(html, /data-tab="parts"/);
    assert.match(html, /data-tab="subscription"/);
    assert.match(html, /data-tab="labor"/);
    assert.match(html, /pcm-dialog/);
    assert.match(html, /pcm-add-btn/);
    assert.match(html, /price-cost-master-v1\.js\?v=2465/);
    assert.match(css, /min-height:\s*52px/);
    assert.match(css, /#1e3a8a/i);
    assert.match(css, /#ffffff/i);
    assert.match(css, /#e2e8f0/i);
    assert.match(js, /粗利額 \/ 粗利率/);
    assert.match(js, /IOT関連/);
    assert.match(js, /renderChips\(UNIFIED_GENRES\)/);
    assert.match(js, /電気工事/);
    assert.match(sw, /tisly-pwa-v2469-security-light|tisly-pwa-v2468-soc-failsafe|tisly-pwa-v2467-soc-iso|tisly-pwa-v2466-security-floor|tisly-pwa-v2465-genre-chips/);
    assert.match(sw, /price-cost-master-v1/);
    assert.match(settings, /\/price-cost-master-v1/);
  });

  it("creates a parts item with unified genre without dropping seeds", async () => {
    const create = await request(app)
      .post("/api/price-cost-master/v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "parts",
        name: "テスト用VVF延長",
        genre: "電気工事",
        sellPrice: 1200,
        costPrice: 400,
        unitLabel: "本",
      });
    assert.equal(create.status, 201, create.body?.error);
    assert.equal(create.body.item.genre, "電気工事");
    const catalog = await request(app)
      .get("/api/price-cost-master/v1/catalog?tab=parts&genre=電気工事")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(catalog.status, 200);
    const names = catalog.body.items.map(
      (i: { name: string }) => i.name
    );
    assert.ok(names.includes("テスト用VVF延長"));
    assert.ok(names.includes("VVFケーブル 2.0mm²-2C 100m巻"));
    assert.ok(
      catalog.body.items.some(
        (i: { id: string }) => i.id === "PCM-PART-IP65-BOX-001"
      )
    );
  });
});
