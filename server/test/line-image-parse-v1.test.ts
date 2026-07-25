/**
 * LINEメモ画像 → 見積明細解析 v1 テスト
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-line-image-parse-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-line-image-parse-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  DEMO_LINE_MEMO_OCR_TEXT,
  parseEstimateLineTextRowV1,
  parseEstimateLinesFromTextV1,
  parseEstimateLinesFromImageV1,
} = await import("../src/estimate/line-image-parse-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    });
}

describe("line-image-parse-v1 unit", () => {
  it("典型的な品名 数量単位 行を解析できる", () => {
    const a = parseEstimateLineTextRowV1(
      "ポールライト用ベース加工（塗装費込） 1台"
    );
    assert.equal(a?.name, "ポールライト用ベース加工（塗装費込）");
    assert.equal(a?.quantity, 1);
    assert.equal(a?.unit, "台");

    const b = parseEstimateLineTextRowV1(
      "防犯カメラ（SDカード録画タイプ） 3台"
    );
    assert.equal(b?.quantity, 3);
    assert.equal(b?.unit, "台");

    const c = parseEstimateLineTextRowV1("ケーブル VVF2.0mm-2C 41m");
    assert.equal(c?.name, "ケーブル VVF2.0mm-2C");
    assert.equal(c?.quantity, 41);
    assert.equal(c?.unit, "m");

    const d = parseEstimateLineTextRowV1("カメラ取付ボックス 3個");
    assert.equal(d?.quantity, 3);
    assert.equal(d?.unit, "個");
  });

  it("デモ OCR テキストから4件抽出できる", () => {
    const items = parseEstimateLinesFromTextV1(DEMO_LINE_MEMO_OCR_TEXT);
    assert.equal(items.length, 4);
    assert.ok(items.some((i) => i.name.includes("ポールライト")));
    assert.ok(items.some((i) => i.quantity === 41 && i.unit === "m"));
  });

  it("画像入力なしは mock_demo で明細を返す（既存破壊なし）", () => {
    const result = parseEstimateLinesFromImageV1({});
    assert.equal(result.source, "mock_demo");
    assert.equal(result.estimateItems.length, 4);
    assert.ok(result.estimateItems.every((it) => it.fromAiCandidate === true));
    assert.ok(result.estimateItems.every((it) => it.amount >= 0));
  });

  it("ocrText 指定時は指定文のみ解析する", () => {
    const result = parseEstimateLinesFromImageV1({
      ocrText: "LAN配線工事 20m\n設定調整 1式",
    });
    assert.equal(result.source, "ocrText");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].unit, "m");
    assert.equal(result.items[1].quantity, 1);
  });
});

describe("line-image-parse-v1 API + UI", () => {
  let token = "";

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
    getDatabase();
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("POST /parse-line-image で明細を返す", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/parse-line-image")
      .set("Authorization", `Bearer ${token}`)
      .send({ forceDemo: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.schemaVersion, 1);
    assert.ok(Array.isArray(res.body.estimateItems));
    assert.equal(res.body.estimateItems.length, 4);
    const names = res.body.estimateItems.map((i: { name: string }) => i.name);
    assert.ok(names.some((n: string) => n.includes("防犯カメラ")));
    assert.ok(names.some((n: string) => n.includes("ケーブル")));
  });

  it("ocrText 付きでカスタム明細を返す", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/parse-line-image")
      .set("Authorization", `Bearer ${token}`)
      .send({ ocrText: "屋外カメラ 2台\n取付工事 1式" });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, "ocrText");
    assert.equal(res.body.estimateItems.length, 2);
    assert.equal(res.body.estimateItems[0].quantity, 2);
  });

  it("見積UIに LINE画像見積ボタンと JS 追記がある", async () => {
    const html = await request(app).get("/estimate-v1.html");
    assert.equal(html.status, 200);
    assert.match(html.text, /btn-line-image-parse/);
    assert.match(html.text, /LINEメモ\/写真から自動見積/);
    assert.match(html.text, /line-image-input-camera/);
    assert.match(html.text, /line-image-input-library/);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /appendParsedEstimateItems/);
    assert.match(js.text, /parseLineImageAndAppend/);
    assert.match(js.text, /parse-line-image/);
    assert.match(js.text, /estimate-ui-v16/);
  });
});
