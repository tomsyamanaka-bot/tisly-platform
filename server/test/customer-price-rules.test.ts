import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-price-rules";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-price-rules.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
import {
  applyCustomerPriceToItems,
  CUSTOMER_PDF_PRICE_RULE_NOTE,
  getCustomerPriceRule,
  isPriceRuleTargetLineItem,
  upsertCustomerPriceRule,
} from "../src/business/customer-price-rules.js";
import { calcTotals, normalizeLineItems } from "../src/business/estimate-math.js";

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

async function createSurveyEstimate(token: string, customerName: string, customerCode: string) {
  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({
      customerCode,
      customerName,
      address: "大阪府大阪市",
      surveyDate: "2026-06-10",
    });
  const surveyProjectId = survey.body.projectId;
  await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/materials`)
    .set("Authorization", `Bearer ${token}`)
    .send({ category: "camera", itemLabel: "屋外カメラ", quantity: 1 });
  await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
  const est = await request(app)
    .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
  return { surveyProjectId, businessProjectId: est.body.businessProjectId as string, estimate: est.body.estimate };
}

describe("顧客別単価ルール v1.2", () => {
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

  it("客A は原価×2.0 で材料単価を計算する", () => {
    const customerId = "BCU-PRICE-A";
    upsertCustomerPriceRule({
      customerId,
      ruleName: "客A",
      costMultiplier: 2.0,
      laborMultiplier: 2.0,
    });
    const rule = getCustomerPriceRule(customerId);
    assert.ok(rule);
    assert.equal(rule.costMultiplier, 2.0);

    const items = applyCustomerPriceToItems(
      normalizeLineItems([{ name: "カメラ", category: "camera", quantity: 1, costPrice: 1000, unitPrice: 0 }]),
      rule
    );
    assert.equal(items[0].unitPrice, 2000);
    assert.equal(items[0].amount, 2000);
  });

  it("その他カテゴリは倍率再計算の対象外（手入力優先）", () => {
    const rule = { costMultiplier: 2.0, laborMultiplier: 2.0 };
    const items = applyCustomerPriceToItems(
      normalizeLineItems([
        { name: "特別調整", category: "other", quantity: 1, costPrice: 1000, unitPrice: 7777 },
      ]),
      rule
    );
    assert.equal(items[0].unitPrice, 7777);
    assert.equal(isPriceRuleTargetLineItem({ category: "other", costPrice: 1000 }), false);
  });

  it("客B は原価×3.0 で材料単価を計算する", () => {
    const customerId = "BCU-PRICE-B";
    upsertCustomerPriceRule({
      customerId,
      ruleName: "客B",
      costMultiplier: 3.0,
      laborMultiplier: 3.0,
    });
    const rule = getCustomerPriceRule(customerId)!;
    const items = applyCustomerPriceToItems(
      normalizeLineItems([{ name: "カメラ", category: "camera", quantity: 2, costPrice: 1000, unitPrice: 0 }]),
      rule
    );
    assert.equal(items[0].unitPrice, 3000);
    assert.equal(items[0].amount, 6000);
  });

  it("出精値引きが小計・税込合計に反映される", () => {
    const items = normalizeLineItems([{ name: "A", quantity: 1, unitPrice: 100000, costPrice: 50000 }]);
    const totals = calcTotals(items, { shuseiDiscount: 10000 });
    assert.equal(totals.lineSubtotal, 100000);
    assert.equal(totals.shuseiDiscount, 10000);
    assert.equal(totals.subtotal, 90000);
    assert.equal(totals.tax, 9000);
    assert.equal(totals.total, 99000);
  });

  it("見積作成時に顧客単価ルールが適用され、出精値引きがPDFに反映される", async () => {
    const customerId = "BCU-SVY-TOMS001";
    upsertCustomerPriceRule({
      customerId,
      ruleName: "法人標準",
      costMultiplier: 2.2,
      laborMultiplier: 2.0,
    });

    const { businessProjectId, estimate } = await createSurveyEstimate(
      token,
      "フレックス株式会社",
      "TOMS001"
    );
    assert.ok(estimate.items.length >= 1);
    const material = estimate.items[0];
    if (material.costPrice && material.costPrice > 0) {
      assert.equal(material.unitPrice, Math.round(material.costPrice * 2.2));
    }

    const detail = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.priceRule.ruleName, "法人標準");
    assert.equal(detail.body.priceRule.costMultiplier, 2.2);

    const items = estimate.items.map((it: { name: string; category: string; unit: string; quantity: number; unitPrice: number; costPrice?: number }) => ({
      ...it,
    }));
    const patched = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items, shuseiDiscount: 10000, shuseiDiscountMemo: "端数調整" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.totals.shuseiDiscount, 10000);
    assert.equal(
      patched.body.totals.total,
      patched.body.totals.subtotal + patched.body.totals.tax
    );

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const pdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);
    const body = pdf.text || "";
    assert.ok(body.includes("出精値引き"));
    assert.ok(body.includes("端数調整"));
    assert.ok(body.includes("税込合計"));
    assert.ok(body.includes("小計"));
    assert.ok(body.includes("税率内訳"));
    assert.ok(body.includes("消費税"));
    assert.ok(body.includes(CUSTOMER_PDF_PRICE_RULE_NOTE));
    assert.ok(!body.includes("× 2.2"));
  });

  it("客Aルールで倍率再計算すると原価×2.0になる", async () => {
    const { businessProjectId } = await createSurveyEstimate(token, "客Aテスト", "TOMS001");
    const items = normalizeLineItems([
      { name: "カメラ", category: "camera", quantity: 1, costPrice: 1000, unitPrice: 0 },
    ]);
    const patched = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items,
        applyPriceRule: true,
        priceRule: { ruleName: "客A", costMultiplier: 2.0, laborMultiplier: 2.0 },
      });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.estimate.items[0].unitPrice, 2000);
    assert.equal(patched.body.estimate.priceRuleName, "客A");
    assert.equal(patched.body.estimate.applyPriceRule, true);
  });

  it("客Bルールで倍率再計算すると原価×3.0になる", async () => {
    const { businessProjectId } = await createSurveyEstimate(token, "客Bテスト", "TOMS001");
    const items = normalizeLineItems([
      { name: "カメラ", category: "camera", quantity: 2, costPrice: 1000, unitPrice: 0 },
    ]);
    const patched = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items,
        applyPriceRule: true,
        priceRule: { ruleName: "客B", costMultiplier: 3.0, laborMultiplier: 3.0 },
      });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.estimate.items[0].unitPrice, 3000);
    assert.equal(patched.body.estimate.items[0].amount, 6000);
  });

  it("手入力単価は確認なしでは上書きされず、forceOverwrite で上書きされる", async () => {
    const { businessProjectId } = await createSurveyEstimate(token, "上書きテスト", "TOMS001");
    const items = normalizeLineItems([
      { name: "カメラ", category: "camera", quantity: 1, costPrice: 1000, unitPrice: 5555 },
    ]);
    const blocked = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items,
        applyPriceRule: true,
        priceRule: { ruleName: "客A", costMultiplier: 2.0, laborMultiplier: 2.0 },
      });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, "manual_price_lines");

    const forced = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items,
        applyPriceRule: true,
        forceOverwriteManualLines: true,
        priceRule: { ruleName: "客A", costMultiplier: 2.0, laborMultiplier: 2.0 },
      });
    assert.equal(forced.status, 200);
    assert.equal(forced.body.estimate.items[0].unitPrice, 2000);
  });

  it("請求書PDFに出精値引き・単価ルール・税込合計が反映される", async () => {
    const { businessProjectId } = await createSurveyEstimate(token, "請求PDFテスト", "TOMS001");
    const detail = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const items = detail.body.estimate.items;
    await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items,
        shuseiDiscount: 5000,
        shuseiDiscountMemo: "特別調整",
        priceRule: { ruleName: "法人標準", costMultiplier: 2.2, laborMultiplier: 2.0 },
      });

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const pdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);
    const body = pdf.text || "";
    assert.ok(body.includes("出精値引き"));
    assert.ok(body.includes("特別調整"));
    assert.ok(body.includes("税込合計"));
    assert.ok(body.includes(CUSTOMER_PDF_PRICE_RULE_NOTE));
    assert.ok(!body.includes("× 2.2"));
  });
});
