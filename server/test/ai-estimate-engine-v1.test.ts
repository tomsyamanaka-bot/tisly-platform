import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-ai-estimate-engine-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-ai-estimate-engine-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER_MOCK = "true";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("AI Estimate Engine v1 — 見積エンジン基盤", () => {
  let token = "";
  let customerId = "";
  let rankId = "";
  let workId = "";
  let materialId = "";
  let overrideId = "";

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

  it("meta を返す", async () => {
    const res = await request(app)
      .get("/api/ai-estimate-engine/v1/meta")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.schemaVersion, "ai_estimate_engine_v1");
    assert.ok(res.body.workCategories.includes("防犯カメラ"));
    assert.ok(res.body.workCategories.includes("電話"));
  });

  it("Phase2 — S/A/B/C ランクマスター", async () => {
    const res = await request(app)
      .get("/api/ai-estimate-engine/v1/rank-master")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const s = res.body.ranks.find((r: { name: string }) => r.name === "S");
    const a = res.body.ranks.find((r: { name: string }) => r.name === "A");
    assert.ok(s);
    assert.ok(a);
    assert.equal(typeof s.grossMarginRate, "number");
    assert.equal(typeof s.discountRate, "number");
    rankId = s.id;
  });

  it("Phase1 — 顧客マスター CRUD", async () => {
    const created = await request(app)
      .post("/api/ai-estimate-engine/v1/customer-master")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "AI見積テスト株式会社",
        customerType: "法人",
        standardMarkupRate: 2.2,
        standardDiscountRate: 3,
        standardLaborUnitPrice: 9000,
        standardTravelFee: 6000,
        rankId,
      });
    assert.equal(created.status, 201);
    customerId = created.body.customer.id;
    assert.equal(created.body.customer.customerType, "法人");
    assert.equal(created.body.customer.standardTravelFee, 6000);

    const patched = await request(app)
      .patch(`/api/ai-estimate-engine/v1/customer-master/${customerId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ standardDiscountRate: 5 });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.customer.standardDiscountRate, 5);
  });

  it("Phase3 — 作業マスター（標準人工・時間）", async () => {
    const created = await request(app)
      .post("/api/ai-estimate-engine/v1/work-master")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "AIテスト作業",
        categoryMain: "防犯カメラ",
        standardLabor: 2,
        standardHours: 3,
        standardUnitPrice: 25000,
        standardCost: 10000,
        laborCost: 5000,
      });
    assert.equal(created.status, 201);
    workId = created.body.workItem.id;
    assert.equal(created.body.workItem.standardLabor, 2);
    assert.equal(created.body.workItem.standardHours, 3);
  });

  it("Phase4 — 材料マスター", async () => {
    const created = await request(app)
      .post("/api/ai-estimate-engine/v1/material-master")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "AIテスト部材",
        categoryMain: "防犯カメラ",
        maker: "TiSLY",
        model: "TEST-001",
        supplier: "テスト仕入先",
        cost: 12000,
        standardSellPrice: 24000,
      });
    assert.equal(created.status, 201);
    materialId = created.body.material.id;
    assert.equal(created.body.material.supplier, "テスト仕入先");
  });

  it("Phase5 — 顧客別単価上書き", async () => {
    const created = await request(app)
      .post("/api/ai-estimate-engine/v1/customer-price-override")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        itemType: "work",
        itemId: workId,
        laborOrMaterialUnitPrice: 28000,
        costPrice: 15000,
      });
    assert.equal(created.status, 201);
    overrideId = created.body.override.id;

    const list = await request(app)
      .get(`/api/ai-estimate-engine/v1/customer-price-override?customerId=${customerId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.overrides.some((o: { id: string }) => o.id === overrideId));
  });

  it("Phase7 — マスター統計", async () => {
    const res = await request(app)
      .get("/api/ai-estimate-engine/v1/stats")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.workCount >= 50);
    assert.ok(res.body.materialCount >= 50);
    assert.ok(Array.isArray(res.body.missingCost.work));
    assert.ok(Array.isArray(res.body.missingSell.materials));

    const masterStats = await request(app)
      .get("/api/master/v1/stats")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(masterStats.status, 200);
    assert.equal(masterStats.body.workCount, res.body.workCount);
  });

  it("Phase8 — Document Center 連携コンテキスト", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "AI見積テスト株式会社",
        siteName: "Document Center 連携現場",
        address: "茨城県守谷市",
      });
    assert.equal(survey.status, 201);

    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const biz = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(biz.status, 201, biz.body?.error);
    const projectId = biz.body.businessProjectId;

    const ctx = await request(app)
      .get(`/api/ai-estimate-engine/v1/document-center/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(ctx.status, 200);
    assert.equal(ctx.body.schemaVersion, "ai_estimate_engine_v1");
    assert.ok(ctx.body.matchedCustomer);
    assert.equal(ctx.body.matchedCustomer.name, "AI見積テスト株式会社");
    assert.ok(ctx.body.documentCenter.estimate.viewerUrl.includes("document-viewer-v1.html"));
    assert.ok(ctx.body.documentCenter.estimate.apiUrl.includes("/document-view"));
  });

  it("クリーンアップ — テストデータ削除", async () => {
    if (overrideId) {
      await request(app)
        .delete(`/api/ai-estimate-engine/v1/customer-price-override/${overrideId}`)
        .set("Authorization", `Bearer ${token}`);
    }
    if (workId) {
      await request(app)
        .delete(`/api/ai-estimate-engine/v1/work-master/${workId}`)
        .set("Authorization", `Bearer ${token}`);
    }
    if (materialId) {
      await request(app)
        .delete(`/api/ai-estimate-engine/v1/material-master/${materialId}`)
        .set("Authorization", `Bearer ${token}`);
    }
    if (customerId) {
      await request(app)
        .delete(`/api/ai-estimate-engine/v1/customer-master/${customerId}`)
        .set("Authorization", `Bearer ${token}`);
    }
  });
});
