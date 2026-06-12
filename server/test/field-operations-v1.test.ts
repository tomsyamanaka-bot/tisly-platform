import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-field-ops-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-field-operations-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { computeShortageQty } = await import("../src/field-ops/purchase-v1-store.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Field Operations System v1", () => {
  let token = "";
  let projectId = "";

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

  it("材料マスターがシードされ一覧取得できる", async () => {
    const res = await request(app)
      .get("/api/materials/v1/materials")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.materials.length >= 10);
    const cam = res.body.materials.find((m: { id: string }) => m.id === "mat-camera-outdoor");
    assert.ok(cam);
    assert.equal(cam.category, "防犯カメラ");
  });

  it("工事テンプレート「防犯カメラ4台」に必要材料が紐付く", async () => {
    const res = await request(app)
      .get("/api/materials/v1/work-templates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const tpl = res.body.templates.find((t: { name: string }) => t.name === "防犯カメラ4台");
    assert.ok(tpl);
    assert.equal(tpl.items.length, 10);
    const camera = tpl.items.find((i: { label: string }) => i.label === "カメラ");
    assert.equal(camera.qty, 4);
  });

  it("現調案件作成→工事テンプレ適用で部材・持ち物・発注が生成される", async () => {
    const created = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "守谷市テスト",
        siteName: "守谷市カメラ工事",
        address: "茨城県守谷市",
      });
    assert.equal(created.status, 201);
    projectId = created.body.projectId;

    const tplRes = await request(app)
      .get("/api/materials/v1/work-templates")
      .set("Authorization", `Bearer ${token}`);
    const templateId = tplRes.body.templates[0].id;

    const applied = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/work-templates`)
      .set("Authorization", `Bearer ${token}`)
      .send({ templateIds: [templateId] });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.fieldCheckCount, 0);
    assert.ok(applied.body.purchaseLineCount >= 2, `purchase lines: ${applied.body.purchaseLineCount}`);
    assert.ok(applied.body.surveyMaterialCount >= 6);

    const detail = await request(app)
      .get(`/api/survey/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(detail.body.materials.length >= 6);
  });

  it("在庫計算 — カメラ4台必要・在庫2 → 不足2", () => {
    const { stockQty, shortageQty } = computeShortageQty("mat-camera-outdoor", 4);
    assert.equal(stockQty, 2);
    assert.equal(shortageQty, 2);
  });

  it("在庫計算 — LAN200m必要・在庫150 → 不足50", () => {
    const { shortageQty } = computeShortageQty("mat-lan-cat6", 200);
    assert.equal(shortageQty, 50);
  });

  it("材料チェックリスト取得・チェック・履歴保存", async () => {
    const added = await request(app)
      .post("/api/field-check/v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId, label: "カメラ" });
    assert.equal(added.status, 201);

    const items = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(items.status, 200);
    assert.equal(items.body.items.length, 1);

    const first = items.body.items[0];
    const checked = await request(app)
      .patch(`/api/field-check/v1/items/${first.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checked: true, checkDate: "2026-06-12" });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.checked, true);

    const session = await request(app)
      .post("/api/field-check/v1/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId, checkDate: "2026-06-12" });
    assert.equal(session.status, 201);
    assert.equal(session.body.totalCount, 1);
    assert.equal(session.body.checkedCount, 1);

    const hist = await request(app)
      .get(`/api/field-check/v1/sessions?source=survey&projectId=${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(hist.body.sessions.length, 1);
  });

  it("発注行のステータス遷移 pending→ordered→received→carried", async () => {
    const linesRes = await request(app)
      .get(`/api/purchase/v1/lines?source=survey&projectId=${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(linesRes.status, 200);
    assert.ok(linesRes.body.lines.length >= 1);
    const line = linesRes.body.lines.find((l: { label: string }) => l.label === "カメラ");
    assert.ok(line);
    assert.equal(line.status, "pending");
    assert.equal(line.shortageQty, 2);

    for (const status of ["ordered", "received", "carried"] as const) {
      const updated = await request(app)
        .patch(`/api/purchase/v1/lines/${line.id}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.status, status);
    }
  });

  it("持ち物・発注 PWA HTML が配信される", async () => {
    const fieldCheck = await request(app).get("/field-check-v1");
    assert.equal(fieldCheck.status, 200);
    assert.ok(fieldCheck.text.includes("材料チェック"));

    const purchase = await request(app).get("/purchase-v1");
    assert.equal(purchase.status, 200);
    assert.ok(purchase.text.includes("発注管理"));
  });

  it("材料マスターの在庫更新", async () => {
    const updated = await request(app)
      .patch("/api/materials/v1/materials/mat-camera-outdoor")
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQty: 10 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.stockQty, 10);
  });
});
