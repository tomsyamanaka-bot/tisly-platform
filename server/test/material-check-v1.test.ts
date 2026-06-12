import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-material-check-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-material-check-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("材料チェック v1", () => {
  let token = "";
  let projectId = "";
  const dateA = "2026-06-10";
  const dateB = "2026-06-11";

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

    const created = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "材料テスト",
        siteName: "材料チェック現場",
        address: "茨城県守谷市",
      });
    assert.equal(created.status, 201);
    projectId = created.body.projectId;
  });

  after(() => closeDatabase());

  it("材料を追加できる", async () => {
    const res = await request(app)
      .post("/api/field-check/v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId, label: "LANケーブル" });
    assert.equal(res.status, 201);
    assert.equal(res.body.label, "LANケーブル");
  });

  it("複数材料を取得し未チェックが先", async () => {
    await request(app)
      .post("/api/field-check/v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId, label: "CVT38sq" });
    const list = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}&date=${dateA}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.items.length >= 2);
    assert.equal(list.body.items.every((i: { checked: boolean }) => !i.checked), true);
  });

  it("チェックON/OFFと進捗が日付別に保存される", async () => {
    const list = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}&date=${dateA}`)
      .set("Authorization", `Bearer ${token}`);
    const first = list.body.items[0];
    const checked = await request(app)
      .patch(`/api/field-check/v1/items/${first.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checked: true, checkDate: dateA });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.checked, true);

    const progressA = await request(app)
      .get(`/api/field-check/v1/progress?source=survey&projectId=${projectId}&date=${dateA}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(progressA.body.checked, 1);
    assert.ok(progressA.body.total >= 2);

    const progressB = await request(app)
      .get(`/api/field-check/v1/progress?source=survey&projectId=${projectId}&date=${dateB}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(progressB.body.checked, 0);
    assert.equal(progressB.body.total, progressA.body.total);
  });

  it("チェック済みは一覧で下に並ぶ", async () => {
    const list = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}&date=${dateA}`)
      .set("Authorization", `Bearer ${token}`);
    const checkedIdx = list.body.items.findIndex((i: { checked: boolean }) => i.checked);
    const uncheckedIdx = list.body.items.findIndex((i: { checked: boolean }) => !i.checked);
    if (checkedIdx >= 0 && uncheckedIdx >= 0) {
      assert.ok(uncheckedIdx < checkedIdx, "未チェックが上、チェック済みが下");
    }
  });

  it("材料名を編集できる", async () => {
    const list = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}&date=${dateA}`)
      .set("Authorization", `Bearer ${token}`);
    const item = list.body.items.find((i: { label: string }) => i.label === "LANケーブル");
    assert.ok(item);
    const updated = await request(app)
      .patch(`/api/field-check/v1/items/${item.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "LANケーブル 30m" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.label, "LANケーブル 30m");
  });

  it("材料を削除できる", async () => {
    const created = await request(app)
      .post("/api/field-check/v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId, label: "削除テスト" });
    const del = await request(app)
      .delete(`/api/field-check/v1/items/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 204);
    const list = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}&date=${dateA}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(!list.body.items.some((i: { label: string }) => i.label === "削除テスト"));
  });

  it("Googleカレンダー連携案件一覧 API", async () => {
    const res = await request(app)
      .get("/api/field-check/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
  });

  it("材料チェック PWA HTML/JS が配信される", async () => {
    const html = await request(app).get("/field-check-v1");
    assert.equal(html.status, 200);
    assert.ok(html.text.includes("材料チェック"));
    assert.ok(html.text.includes("材料を追加"));

    const js = await request(app).get("/js/field-check-v1.js");
    assert.ok(js.text.includes("check-item-label"));
    assert.ok(js.text.includes("材料がまだ登録されていません"));
  });

  it("departure-reminder.js に材料チェックリンクがある", async () => {
    const js = await request(app).get("/js/departure-reminder.js");
    assert.ok(js.text.includes("材料チェックを開く"));
    assert.ok(js.text.includes("fieldCheckProgress"));
  });
});
