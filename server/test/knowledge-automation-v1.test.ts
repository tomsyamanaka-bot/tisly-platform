import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-auto-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-auto-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  buildMothershipPlcRelativePath,
  buildMothershipFactoryRelativePath,
  buildMothership3DPrintAssetRelativePath,
} = await import("../src/storage/mothership-paths-v1.js");
const { businessStatusToAutomationStageV1 } = await import(
  "../src/knowledge/knowledge-automation-hooks-v1.js"
);
const { parseProjectPdfKnowledgeV1 } = await import("../src/knowledge/knowledge-pdf-parser-v1.js");
const { runPhotoOcrV1 } = await import("../src/knowledge/knowledge-photo-ocr-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Automation Engine v1", () => {
  let token = "";
  let projectId = "BIZ-KNOW-AUTO";

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

    const db = getDatabase();
    db.prepare(`DELETE FROM business_estimates WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM business_projects WHERE id = ?`).run(projectId);
    db.prepare(
      `INSERT INTO business_projects (id, project_no, customer_id, customer_name, title, address, status, created_at, updated_at)
       VALUES (?, 'MO-26-0621-100', 'cust-auto', '自動収集テスト', '防犯カメラ工事', '守谷', 'estimate_created', datetime('now'), datetime('now'))`
    ).run(projectId);
    db.prepare(
      `INSERT INTO business_estimates (id, project_id, estimate_no, customer_name, title, items_json, subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate, created_at, updated_at)
       VALUES ('est-auto-1', ?, 'EST-AUTO', '自動収集テスト', '防犯カメラ工事',
         ?, 100000, 10000, 110000, 50000, 50000, 50, datetime('now'), datetime('now'))`
    ).run(
      projectId,
      JSON.stringify([
        { id: "1", category: "material", name: "UTPケーブル", unit: "m", quantity: 50, unitPrice: 200, amount: 10000 },
        { id: "2", category: "equipment", name: "防犯カメラ DS-2CD", unit: "台", quantity: 4, unitPrice: 15000, amount: 60000 },
      ])
    );
    db.prepare(`UPDATE business_projects SET estimate_id = 'est-auto-1' WHERE id = ?`).run(projectId);
  });

  after(() => closeDatabase());

  it("MotherShip asset paths — PLC / 3DPrint / Factory", () => {
    assert.equal(buildMothershipPlcRelativePath("Templates", "self.gxw"), "PLC/Templates/self.gxw");
    assert.equal(
      buildMothership3DPrintAssetRelativePath("DINRail", "bracket.stl"),
      "3DPrint/DINRail/bracket.stl"
    );
    assert.equal(
      buildMothershipFactoryRelativePath("Conveyor", "demo.json"),
      "Factory/Conveyor/demo.json"
    );
  });

  it("businessStatusToAutomationStageV1 maps pipeline stages", () => {
    assert.equal(businessStatusToAutomationStageV1("new"), "project_created");
    assert.equal(businessStatusToAutomationStageV1("survey_done"), "survey");
    assert.equal(businessStatusToAutomationStageV1("estimate_created"), "estimate");
    assert.equal(businessStatusToAutomationStageV1("construction_scheduled"), "construction");
    assert.equal(businessStatusToAutomationStageV1("construction_done"), "completed");
  });

  it("parseProjectPdfKnowledgeV1 extracts estimate items rule-based", () => {
    const extract = parseProjectPdfKnowledgeV1({ projectId, pdfKind: "estimate" });
    assert.equal(extract.projectNo, "MO-26-0621-100");
    assert.equal(extract.customerName, "自動収集テスト");
    assert.ok(extract.materialNames.some((n) => n.includes("UTP")));
    assert.ok(extract.equipmentNames.some((n) => n.includes("防犯カメラ")));
  });

  it("runPhotoOcrV1 rule-based engine extracts model numbers", async () => {
    const extract = await runPhotoOcrV1({
      photoId: "ph-1",
      photoKind: "completion",
      title: "盤内ラベル DS-2CD2046G2-I 20Aブレーカ",
    });
    assert.equal(extract.engine, "rule_based_v1");
    assert.ok(extract.modelNumbers.length >= 1 || extract.breakerCapacities.length >= 1);
  });

  it("POST /api/knowledge/automation/run creates pending candidates", async () => {
    const res = await request(app)
      .post(`/api/knowledge/automation/run/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.candidates?.length >= 1);
    assert.equal(res.body.stage, "estimate");
  });

  it("GET /api/knowledge/candidates lists pending candidates", async () => {
    const res = await request(app)
      .get("/api/knowledge/candidates?status=pending")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.candidates.length >= 1);
    assert.ok(res.body.stats.pending >= 1);
  });

  it("POST /api/knowledge/candidates/:id/approve registers knowledge card", async () => {
    const run = await request(app)
      .post(`/api/knowledge/automation/run/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(run.status, 200);
    const candidate =
      run.body.candidates?.find((c: { status?: string }) => c.status === "pending") ??
      run.body.candidates?.[0];
    assert.ok(candidate?.id, run.body?.error ?? "no candidate from automation run");

    const res = await request(app)
      .post(`/api/knowledge/candidates/${candidate.id}/approve`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200, res.body?.error);
    assert.ok(res.body.card?.id);
    assert.equal(res.body.candidate.status, "approved");
  });

  it("POST /api/knowledge/assets/seed creates PLC/3DPrint/Factory assets", async () => {
    const res = await request(app)
      .post("/api/knowledge/assets/seed")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.plc >= 1);
    assert.ok(res.body.factory >= 1);
  });

  it("GET /api/knowledge/mothership/explorer returns tree", async () => {
    const res = await request(app)
      .get("/api/knowledge/mothership/explorer")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.roots?.length >= 1);
    assert.ok(res.body.summary.knowledgeCards >= 0);
  });

  it("GET /api/knowledge/mothership/project/:projectNo returns links", async () => {
    const res = await request(app)
      .get("/api/knowledge/mothership/project/MO-26-0621-100")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.projectNo, "MO-26-0621-100");
    assert.ok(res.body.links.length >= 5);
  });
});
