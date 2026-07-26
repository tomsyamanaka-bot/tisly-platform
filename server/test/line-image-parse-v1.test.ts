/**
 * LINEメモ画像 → 見積明細解析 v1 テスト
 * （固定デモ明細なし・円表記・Gemini差し込み）
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";
import sharp from "sharp";

process.env.JWT_SECRET = "test-jwt-line-image-parse-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-line-image-parse-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  SAMPLE_LINE_MEMO_OCR_TEXT,
  DEMO_LINE_MEMO_OCR_TEXT,
  parseEstimateLineTextRowV1,
  parseEstimateLinesFromTextV1,
  parseEstimateLinesFromImageV1,
  cleanEstimateLineNameV1,
} = await import("../src/estimate/line-image-parse-v1.js");
const {
  parseLineImageGeminiJsonV1,
} = await import("../src/estimate/line-image-gemini-vision-v1.js");

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
  it("円表記の典型行を正確に明細化する", () => {
    const a = parseEstimateLineTextRowV1(
      "1F リビング 200V 4.0kw 105,000円"
    );
    assert.equal(a?.name, "1F リビング 200V 4.0kw");
    assert.equal(a?.quantity, 1);
    assert.equal(a?.unitPrice, 105000);
    assert.equal(a?.quantity && a.unitPrice * a.quantity, 105000);

    const b = parseEstimateLineTextRowV1("FY-6V 14,000円 ×3台");
    assert.equal(b?.name, "FY-6V");
    assert.equal(b?.quantity, 3);
    assert.equal(b?.unit, "台");
    assert.equal(b?.unitPrice, 14000);

    const c = parseEstimateLineTextRowV1("施工費 20,000円");
    assert.equal(c?.name, "施工費");
    assert.equal(c?.quantity, 1);
    assert.equal(c?.unitPrice, 20000);
  });

  it("数量単位のみの行も解析できる", () => {
    const c = parseEstimateLineTextRowV1("ケーブル VVF2.0mm-2C 41m");
    assert.equal(c?.name, "ケーブル VVF2.0mm-2C");
    assert.equal(c?.quantity, 41);
    assert.equal(c?.unit, "m");
  });

  it("サンプル OCR 文から複数件抽出できる", () => {
    const items = parseEstimateLinesFromTextV1(SAMPLE_LINE_MEMO_OCR_TEXT);
    assert.ok(items.length >= 3);
    assert.ok(items.some((i) => i.name.includes("リビング")));
    assert.ok(items.some((i) => i.name === "FY-6V" && i.quantity === 3));
    assert.ok(items.some((i) => i.name === "施工費"));
    assert.equal(DEMO_LINE_MEMO_OCR_TEXT, SAMPLE_LINE_MEMO_OCR_TEXT);
  });

  it("入力なしは固定デモを返さず empty", async () => {
    const result = await parseEstimateLinesFromImageV1({});
    assert.equal(result.source, "empty");
    assert.equal(result.estimateItems.length, 0);
    assert.ok(
      !result.estimateItems.some((it) =>
        String(it.name).includes("ポールライト")
      )
    );
    assert.ok(result.warnings.length >= 1);
  });

  it("ocrText 指定時は指定文のみ解析する", async () => {
    const result = await parseEstimateLinesFromImageV1({
      ocrText: "LAN配線工事 20m\n設定調整 1式",
    });
    assert.equal(result.source, "ocrText");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].unit, "m");
    assert.equal(result.items[1].quantity, 1);
  });

  it("品名タグを除去する", () => {
    assert.equal(
      cleanEstimateLineNameV1("施工費 [LINE画像解析]"),
      "施工費"
    );
  });

  it("Gemini JSON レスポンスをパースできる", () => {
    const parsed = parseLineImageGeminiJsonV1(
      JSON.stringify({
        rawText: "施工費 20,000円",
        items: [
          {
            name: "施工費 [LINE画像解析]",
            quantity: 1,
            unit: "式",
            unitPrice: 20000,
          },
        ],
      })
    );
    assert.ok(parsed);
    assert.equal(parsed?.items[0]?.name, "施工費");
    assert.equal(parsed?.items[0]?.unitPrice, 20000);
  });

  it("visionOverride（実画像相当）で明細化しタグなし", async () => {
    const png = await sharp({
      create: {
        width: 640,
        height: 320,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const result = await parseEstimateLinesFromImageV1({
      imageBase64: png.toString("base64"),
      fileName: "line-memo.png",
      visionOverride: {
        rawText: [
          "1F リビング 200V 4.0kw 105,000円",
          "FY-6V 14,000円 ×3台",
          "施工費 20,000円",
        ].join("\n"),
        items: [
          {
            name: "1F リビング 200V 4.0kw",
            quantity: 1,
            unit: "式",
            unitPrice: 105000,
          },
          {
            name: "FY-6V",
            quantity: 3,
            unit: "台",
            unitPrice: 14000,
          },
          {
            name: "施工費",
            quantity: 1,
            unit: "式",
            unitPrice: 20000,
          },
        ],
      },
    });

    assert.equal(result.source, "gemini_vision");
    assert.equal(result.provider, "gemini_vision_v1");
    assert.equal(result.estimateItems.length, 3);
    assert.equal(result.estimateItems[0].unitPrice, 105000);
    assert.equal(result.estimateItems[1].amount, 42000);
    assert.equal(result.estimateItems[2].name, "施工費");
    assert.ok(
      result.estimateItems.every((it) => !/LINE画像解析/.test(it.name))
    );
    assert.ok(result.estimateItems.every((it) => it.memo === ""));
    assert.ok(
      !result.rawText.includes("ポールライト用ベース加工")
    );
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

  it("POST /parse-line-image は forceDemo でも固定デモを返さない", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/parse-line-image")
      .set("Authorization", `Bearer ${token}`)
      .send({ forceDemo: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.schemaVersion, 1);
    assert.ok(Array.isArray(res.body.estimateItems));
    assert.equal(res.body.estimateItems.length, 0);
    assert.ok(
      !(res.body.estimateItems || []).some((i: { name: string }) =>
        String(i.name).includes("ポールライト")
      )
    );
    assert.ok(
      (res.body.warnings || []).some((w: string) =>
        /forceDemo|抽出|GEMINI|OCR/i.test(w)
      )
    );
  });

  it("ocrText 付きでカスタム明細を返す", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/parse-line-image")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ocrText: "屋外カメラ 2台\n施工費 20,000円",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, "ocrText");
    assert.equal(res.body.estimateItems.length, 2);
    assert.equal(res.body.estimateItems[0].quantity, 2);
    assert.equal(res.body.estimateItems[1].unitPrice, 20000);
    assert.equal(res.body.estimateItems[1].memo, "");
  });

  it("見積UIに 写真で見積もり作成ボタンと JS 追記がある", async () => {
    const html = await request(app).get("/estimate-v1.html");
    assert.equal(html.status, 200);
    assert.match(html.text, /btn-line-image-parse/);
    assert.match(html.text, /📷 写真で見積もり作成/);
    assert.match(html.text, /line-image-input-camera/);
    assert.match(html.text, /line-image-input-library/);
    assert.match(html.text, /line-image-parse-btn/);
    assert.match(html.text, /min-height:\s*68px/);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /appendParsedEstimateItems/);
    assert.match(js.text, /parseLineImageAndAppend/);
    assert.match(js.text, /parse-line-image/);
    assert.match(js.text, /estimate-ui-v19/);
    assert.match(js.text, /60_000/);
    assert.doesNotMatch(js.text, /memo: it\.memo \|\| "\[写真見積解析\]"/);
  });
});
