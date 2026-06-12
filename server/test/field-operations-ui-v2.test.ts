import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-field-ops-ui-v2";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-field-operations-ui-v2.db";
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

describe("Field Operations UI v2", () => {
  let token = "";
  let projectId = "";
  let businessProjectId = "";

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

  it("現調案件に工事種別を保存できる", async () => {
    const created = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "UI v2 テスト",
        siteName: "カメラ工事現場",
        workTypes: ["camera", "lan"],
      });
    assert.equal(created.status, 201);
    projectId = created.body.projectId;
    assert.deepEqual(created.body.workTypes, ["camera", "lan"]);
  });

  it("工事テンプレ適用→案件パイプラインに持ち物・発注が反映", async () => {
    const tplRes = await request(app)
      .get("/api/materials/v1/work-templates")
      .set("Authorization", `Bearer ${token}`);
    const templateId = tplRes.body.templates[0].id;

    await request(app)
      .post(`/api/survey/v1/projects/${projectId}/work-templates`)
      .set("Authorization", `Bearer ${token}`)
      .send({ templateIds: [templateId] });

    const detail = await request(app)
      .get(`/api/projects/v1/projects/${projectId}?source=survey`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    const p = detail.body.project.pipeline;
    assert.ok(["active", "done", "pending"].includes(p.field_check));
    assert.ok(["active", "done", "pending"].includes(p.purchase));
  });

  it("見積引き渡し→テンプレから明細自動生成", async () => {
    await request(app)
      .post(`/api/survey/v1/projects/${projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok([200, 201].includes(est.status), `status ${est.status}`);
    businessProjectId = est.body.businessProjectId;
    assert.ok(est.body.estimate?.items?.length >= 4, "template materials should seed estimate lines");
  });

  it("ダッシュボード API がホームカードを返す", async () => {
    const dash = await request(app)
      .get("/api/projects/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(dash.status, 200);
    const ids = dash.body.cards.map((c: { id: string }) => c.id);
    assert.ok(ids.includes("today_sites"));
    assert.ok(ids.includes("field_check_short"));
    assert.ok(ids.includes("purchase_pending"));
    assert.ok(ids.includes("invoice_pending"));
  });

  it("材料チェックは手動追加・日付別チェックできる", async () => {
    await request(app)
      .post("/api/field-check/v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId, label: "PoEハブ" });
    const items = await request(app)
      .get(`/api/field-check/v1/items?source=survey&projectId=${projectId}&date=2026-06-12`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(items.status, 200);
    assert.ok(items.body.items.length >= 1);
    const first = items.body.items[0];
    const checked = await request(app)
      .patch(`/api/field-check/v1/items/${first.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checked: true, checkDate: "2026-06-12" });
    assert.equal(checked.body.checked, true);
  });

  it("発注行に不足・ステータス情報がある", async () => {
    const lines = await request(app)
      .get(`/api/purchase/v1/lines?source=survey&projectId=${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(lines.status, 200);
    assert.ok(lines.body.lines.length >= 1);
    const shortage = lines.body.lines.find((l: { shortageQty: number }) => l.shortageQty > 0);
    assert.ok(shortage);
  });

  it("案件詳細 HTML・PWA が配信される", async () => {
    const projects = await request(app).get("/projects-v1");
    assert.equal(projects.status, 200);
    assert.ok(projects.text.includes("dashboard-grid"));

    const survey = await request(app).get("/survey-v1");
    assert.ok(survey.text.includes("detail-work-templates"));
  });
});
