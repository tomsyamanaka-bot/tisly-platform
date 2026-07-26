/**
 * TOMS マスター単価 + 見積履歴 v1 テスト
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-toms-master-history-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-toms-master-history-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  suggestTomsMasterPriceV1,
  applyTomsMasterPricesToItemsV1,
  listTomsMasterItemsV1,
  TOMS_MASTER_ITEMS_V1,
} = await import("../src/estimate/toms-master-data-v1.js");
const {
  saveTomsEstimateHistoryV1,
  listTomsEstimateHistoryV1,
  duplicateTomsEstimateHistoryV1,
  buildTomsEstimateLineShareTextV1,
} = await import("../src/estimate/toms-estimate-history-store-v1.js");
const {
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

describe("toms-master-data-v1 unit", () => {
  it("標準マスターに VVF / PF管 / ボックス / 人工が含まれる", () => {
    const items = listTomsMasterItemsV1();
    assert.ok(items.length >= 10);
    assert.ok(TOMS_MASTER_ITEMS_V1.some((i) => /VVF/i.test(i.name)));
    assert.ok(TOMS_MASTER_ITEMS_V1.some((i) => /PF管/i.test(i.name)));
    assert.ok(TOMS_MASTER_ITEMS_V1.some((i) => /ボックス/i.test(i.name)));
    assert.ok(TOMS_MASTER_ITEMS_V1.some((i) => /人工|設定/i.test(i.name)));
  });

  it("類似品名から単価を提案できる", () => {
    const vvf = suggestTomsMasterPriceV1("ケーブル VVF2.0mm-2C");
    assert.equal(vvf.matched, true);
    assert.ok((vvf.item?.unitPrice || 0) > 0);

    const box = suggestTomsMasterPriceV1("取付ボックス 3個");
    assert.equal(box.matched, true);

    const labor = suggestTomsMasterPriceV1("設定費");
    assert.equal(labor.matched, true);
    assert.equal(labor.item?.unitPrice, 15000);
  });

  it("unitPrice>0 は上書きせず、0 のみ補完する", () => {
    const { items, appliedCount } = applyTomsMasterPricesToItemsV1([
      { name: "VVFケーブル", unitPrice: 999, unit: "m" },
      { name: "PF管", unitPrice: 0, unit: "m" },
    ]);
    assert.equal(items[0].unitPrice, 999);
    assert.ok(items[1].unitPrice > 0);
    assert.equal(appliedCount, 1);
  });
});

describe("toms-estimate-history-v1 unit", () => {
  it("保存・一覧・複製・LINEテキストが動作する", () => {
    const saved = saveTomsEstimateHistoryV1({
      customerName: "テスト様",
      subject: "防犯カメラ工事",
      items: [
        { name: "屋外防犯カメラ設置", unit: "台", quantity: 2, unitPrice: 35000 },
        { name: "設定・動作確認費", unit: "式", quantity: 1, unitPrice: 15000 },
      ],
      createdBy: "test",
    });
    assert.ok(saved.id.startsWith("TEH-"));
    assert.equal(saved.customerName, "テスト様");
    assert.ok(saved.total > saved.subtotal);

    const list = listTomsEstimateHistoryV1({ limit: 10 });
    assert.ok(list.some((r) => r.id === saved.id));

    const dup = duplicateTomsEstimateHistoryV1(saved.id, { createdBy: "test" });
    assert.notEqual(dup.id, saved.id);
    assert.match(dup.subject, /複製/);

    const text = buildTomsEstimateLineShareTextV1({
      customerName: saved.customerName,
      subject: saved.subject,
      items: saved.items,
      subtotal: saved.subtotal,
      tax: saved.tax,
      total: saved.total,
    });
    assert.match(text, /TOMS/);
    assert.match(text, /税込合計/);
    assert.match(text, /防犯カメラ/);
  });
});

describe("line-image + toms master 連携", () => {
  it("OCRで単価0のVVFにマスター単価を補完する", async () => {
    const result = await parseEstimateLinesFromImageV1({
      ocrText: "ケーブル VVF2.0mm-2C 41m\n施工費 20,000円",
    });
    const vvf = result.items.find((i) => /VVF/i.test(i.name));
    assert.ok(vvf);
    assert.equal(vvf.quantity, 41);
    assert.ok(vvf.unitPrice > 0);
    const labor = result.items.find((i) => i.name === "施工費");
    assert.equal(labor?.unitPrice, 20000);
    assert.ok(
      result.warnings.some((w) => /TOMSマスター単価/.test(w))
    );
  });
});

describe("toms-master/history API + UI", () => {
  let token = "";

  before(async () => {
    const login = await surveyorLogin();
    assert.equal(login.status, 200);
    token = login.body.token;
  });

  after(() => {
    closeDatabase();
    try {
      fs.unlinkSync("./data/test-toms-master-history-v1.db");
    } catch {
      /* ignore */
    }
  });

  it("GET /toms-master が単価一覧を返す", async () => {
    const res = await request(app)
      .get("/api/estimate/v1/toms-master")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.length >= 10);
  });

  it("POST /toms-master/suggest が補完結果を返す", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/toms-master/suggest")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { name: "VVF", unitPrice: 0 },
          { name: "既知単価", unitPrice: 1234 },
        ],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.appliedCount, 1);
    assert.ok(res.body.items[0].unitPrice > 0);
    assert.equal(res.body.items[1].unitPrice, 1234);
  });

  it("POST/GET /toms-estimate-history で保存・一覧できる", async () => {
    const save = await request(app)
      .post("/api/estimate/v1/toms-estimate-history")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerName: "APIテスト様",
        subject: "LAN工事",
        items: [
          { name: "Cat6 LANケーブル敷設", unit: "m", quantity: 20, unitPrice: 650 },
        ],
      });
    assert.equal(save.status, 201);
    assert.ok(save.body.record?.id);

    const list = await request(app)
      .get("/api/estimate/v1/toms-estimate-history")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.records.some((r: { id: string }) => r.id === save.body.record.id));

    const dup = await request(app)
      .post(`/api/estimate/v1/toms-estimate-history/${save.body.record.id}/duplicate`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(dup.status, 201);
    assert.notEqual(dup.body.record.id, save.body.record.id);
  });

  it("POST /toms-estimate-share-text がテキストを返す", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/toms-estimate-share-text")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerName: "共有テスト様",
        subject: "テスト",
        items: [{ name: "配線工事費", unit: "式", quantity: 1, unitPrice: 25000 }],
      });
    assert.equal(res.status, 200);
    assert.match(res.body.text, /LINE|TOMS|配線工事|税込合計/);
  });

  it("見積UIに爆速ボタンと履歴タブがある", async () => {
    const html = await request(app).get("/estimate-v1.html");
    assert.equal(html.status, 200);
    assert.match(html.text, /btn-toms-blast-pdf/);
    assert.match(html.text, /btn-toms-blast-line/);
    assert.match(html.text, /btn-toms-blast-save/);
    assert.match(html.text, /tab-toms-history/);
    assert.match(html.text, /toms-history-list/);
    assert.match(html.text, /estimate-ui-v19/);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /estimate-ui-v19/);
    assert.match(js.text, /blastCopyLineShareText/);
    assert.match(js.text, /blastSaveTomsHistory/);
    assert.match(js.text, /TOMS_HISTORY_LOCAL_KEY/);
    // 既存 OCR 機能が残っていること
    assert.match(js.text, /btn-line-image-parse|parseLineImageAndAppend/);
  });
});
