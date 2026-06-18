import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-master-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-master-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER_MOCK = "true";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { getDefaultStorageProvider } = await import("../src/storage/storage-provider-factory.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Master v1 — 見積マスター基盤", () => {
  let token = "";
  let sketchId = "";

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

  it("マスターデータがシードされ meta を返す", async () => {
    const res = await request(app)
      .get("/api/master/v1/meta")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.workCategories.length >= 3);
    assert.ok(res.body.materialCategories.length >= 3);
    assert.ok(res.body.chipFilters.length >= 5);
    assert.ok(res.body.categories.length >= 20);
    assert.deepEqual(res.body.storageProviders, ["local", "webdav", "qnap"]);
  });

  it("カテゴリ階層 API", async () => {
    const res = await request(app)
      .get("/api/master/v1/categories?categoryMain=防犯カメラ")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.categories.some((c: { categorySub: string }) => c.categorySub === "カメラ設置"));
  });

  it("顧客・ランク・作業・材料マスター一覧", async () => {
    const customers = await request(app)
      .get("/api/master/v1/customers")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(customers.status, 200);
    assert.ok(customers.body.customers.length >= 2);

    const work = await request(app)
      .get("/api/master/v1/work-items")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(work.status, 200);
    const cam = work.body.workItems.find((w: { code: string }) => w.code === "W-CAM-INST");
    assert.ok(cam);
    assert.equal(cam.name, "カメラ設置");

    const mats = await request(app)
      .get(`/api/master/v1/materials?categoryMain=${encodeURIComponent("LAN / ネットワーク")}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(mats.status, 200);
    assert.ok(mats.body.materials.some((m: { code: string }) => m.code === "M-LAN"));

    const workCat = await request(app)
      .get(`/api/master/v1/work-items?chip=${encodeURIComponent("防犯カメラ")}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(workCat.status, 200);
    assert.ok(workCat.body.workItems.length >= 5);
    assert.ok(workCat.body.workItems.every((w: { categoryMain: string }) => w.categoryMain === "防犯カメラ"));

    const search = await request(app)
      .get("/api/master/v1/materials?q=RJ45")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(search.status, 200);
    assert.ok(search.body.materials.some((m: { name: string }) => m.name.includes("RJ45")));
  });

  it("symbolMapping がカメラ記号と作業を紐付ける", async () => {
    const res = await request(app)
      .get("/api/master/v1/symbol-mappings")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const dome = res.body.mappings.find((m: { symbolType: string }) => m.symbolType === "dome_camera");
    assert.ok(dome);
    assert.equal(dome.workItemId, "work-dome-camera");
    assert.equal(dome.materialId, "mat-v1-dome-cam");
    assert.ok(dome.extraMaterialIds.length >= 2);
    assert.equal(dome.categoryMain, "防犯カメラ");
    const lan = res.body.mappings.find((m: { symbolType: string }) => m.symbolType === "lan");
    assert.ok(lan);
    assert.equal(lan.mappingKind, "line");
  });

  it("現調図面から estimate-preview で候補抽出", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "マスター見積テスト様",
        siteName: "候補抽出現場",
        address: "茨城県守谷市",
      });
    assert.equal(survey.status, 201);
    const projectId = survey.body.projectId;

    const sketchRes = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "見積プレビューテスト" });
    assert.equal(sketchRes.status, 201);
    sketchId = sketchRes.body.sketch.id;

    await request(app)
      .patch(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        layers: {
          schemaVersion: 2,
          drawingVersion: 2,
          canvasWidth: 800,
          canvasHeight: 600,
          paths: [
            {
              id: "p1",
              tool: "route",
              lineType: "lan",
              color: "#2563eb",
              width: 3,
              points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
              lengthPx: 100,
            },
          ],
          symbols: [
            {
              id: "s1",
              symbolType: "dome_camera",
              label: "ドームカメラ",
              icon: "📷",
              color: "#2563eb",
              x: 50,
              y: 50,
              rotation: 0,
              scale: 1,
              memo: "入口",
            },
            {
              id: "s2",
              symbolType: "access_point",
              label: "AP",
              icon: "📶",
              color: "#0284c7",
              x: 200,
              y: 100,
              rotation: 0,
              scale: 1,
              memo: "",
            },
          ],
          notes: [],
          viewport: { scale: 1, offsetX: 0, offsetY: 0 },
        },
      });

    const preview = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.symbolCount, 2);
    assert.equal(preview.body.pathCount, 1);
    assert.ok(preview.body.workCandidates.length >= 2);
    const camWork = preview.body.workCandidates.find(
      (c: { label: string }) => c.label === "ドームカメラ設置"
    );
    assert.ok(camWork);
    assert.equal(camWork.qty, 1);
    assert.ok(preview.body.materialCandidates.length >= 3);
    const apWork = preview.body.workCandidates.find((c: { label: string }) => c.label === "AP設置");
    assert.ok(apWork);
    assert.ok(Array.isArray(preview.body.workLines));
    assert.ok(Array.isArray(preview.body.materialLines));
    assert.ok(preview.body.totalCost >= 0);
    assert.ok(preview.body.totalSell >= 0);
    assert.equal(typeof preview.body.grossProfitRate, "number");
  });

  it("estimate-preview に顧客ランク・上書き単価を反映", async () => {
    const withCustomer = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}&customerId=cust-demo-a`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(withCustomer.status, 200);
    assert.equal(withCustomer.body.customerId, "cust-demo-a");
    const line = withCustomer.body.workLines.find(
      (l: { label: string }) => l.label === "ドームカメラ設置"
    );
    assert.ok(line);
    assert.ok(["customer_override", "rank_multiplier", "standard", "cost_double", "missing"].includes(line.priceSource));
    assert.ok(line.appliedUnitSell > 0);
  });

  it("estimate-preview apply で draft JSON を保存", async () => {
    const preview = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    const apply = await request(app)
      .post("/api/master/v1/estimate-preview/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ sketchId, preview: preview.body });
    assert.equal(apply.status, 201);
    assert.ok(apply.body.draft.id);
    const got = await request(app)
      .get(`/api/master/v1/estimate-drafts/${apply.body.draft.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.draft.preview.sketchId, sketchId);
  });

  it("estimate-drafts apply-to-estimate で見積PWAへ反映", async () => {
    const preview = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    const saved = await request(app)
      .post("/api/master/v1/estimate-preview/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ sketchId, preview: preview.body });
    const apply = await request(app)
      .post(`/api/master/v1/estimate-drafts/${saved.body.draft.id}/apply-to-estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(apply.status, 201);
    assert.ok(apply.body.businessProjectId);
    assert.equal(apply.body.draft.status, "applied");
    assert.ok(apply.body.detail.estimate?.items?.length >= 1);

    const estimate = await request(app)
      .post(`/api/estimate/v1/from-master-draft/${saved.body.draft.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(estimate.status, 201);
    assert.equal(estimate.body.masterDraftId, saved.body.draft.id);
  });

  it("categories reorder で sort_order を保存", async () => {
    const cats = await request(app)
      .get("/api/master/v1/categories")
      .set("Authorization", `Bearer ${token}`);
    const ids = cats.body.categories.slice(0, 2).map((c: { id: string }) => c.id);
    if (ids.length < 2) return;
    const res = await request(app)
      .post("/api/master/v1/categories/reorder")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orders: [
          { id: ids[0], sortOrder: 99 },
          { id: ids[1], sortOrder: 100 },
        ],
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 2);
  });

  it("未入力フィルタ missingFilter=cost", async () => {
    const res = await request(app)
      .get("/api/master/v1/work-items?missingFilter=cost")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.workItems.length >= 1);
    assert.ok(
      res.body.workItems.every(
        (w: { standardCost: number; laborCost: number }) => w.standardCost + w.laborCost <= 0
      )
    );
  });

  it("作業・材料マスターが50件以上（防犯カメラ拡張シード）", async () => {
    const work = await request(app)
      .get("/api/master/v1/work-items")
      .set("Authorization", `Bearer ${token}`);
    const mats = await request(app)
      .get("/api/master/v1/materials")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(work.body.workItems.length >= 50, `work count ${work.body.workItems.length}`);
    assert.ok(mats.body.materials.length >= 50, `material count ${mats.body.materials.length}`);
  });

  it("meta に missingFilters を返す", async () => {
    const res = await request(app)
      .get("/api/master/v1/meta")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(res.body.missingFilters.length >= 5);
  });

  it("顧客別単価と CSV エクスポート", async () => {
    const prices = await request(app)
      .get("/api/master/v1/customer-prices?customerId=cust-demo-a")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(prices.status, 200);
    assert.ok(prices.body.prices.length >= 1);

    const csv = await request(app)
      .get("/api/master/v1/csv/work-items")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(csv.status, 200);
    assert.ok(csv.text.includes("カメラ設置"));
  });

  it("一括更新で favorite を設定", async () => {
    const work = await request(app)
      .get("/api/master/v1/work-items")
      .set("Authorization", `Bearer ${token}`);
    const id = work.body.workItems[0].id;
    const res = await request(app)
      .post("/api/master/v1/bulk-update")
      .set("Authorization", `Bearer ${token}`)
      .send({ entity: "work-items", ids: [id], patch: { favorite: true } });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 1);
  });

  it("StorageProvider local テスト", async () => {
    const provider = getDefaultStorageProvider("local");
    const test = await provider.testConnection();
    assert.equal(test.ok, true);
    assert.equal(test.provider, "local");
    const put = await provider.put(Buffer.from("test"), { remotePath: "test/sample.txt" });
    assert.equal(put.ok, true);
    const exists = await provider.exists("test/sample.txt");
    assert.equal(exists, true);
  });

  it("StorageProvider API テスト", async () => {
    for (const kind of ["local", "webdav", "qnap"]) {
      const res = await request(app)
        .post("/api/master/v1/storage-providers/test")
        .set("Authorization", `Bearer ${token}`)
        .send({
          kind,
          config: { host: "192.168.1.1", port: 8080, webdavUrl: "http://192.168.1.1:8080/TiSLY" },
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true, kind);
    }
  });
});
