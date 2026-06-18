import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-invoice-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-invoice-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { getInvoice } = await import("../src/business/business-store.js");
const { TOMS_DEFAULT_BANK_INFO, resolveTomsBankInfo } = await import(
  "../src/business/toms-document-format.js"
);
const { getTomsCompanyInfo } = await import("../src/business/pdf/company.js");

const app = createApp();
const INV_NO_RE = /^INV-[A-Z]{2}-\d{2}-\d{4}-\d{3}$/;

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Invoice v1 — TOMS 請求番号", () => {
  let token = "";
  let businessProjectId = "";
  let estimateNo = "";

  before(async () => {
    closeDatabase();
    for (const p of [
      process.env.TISLY_DB_PATH!,
      `${process.env.TISLY_DB_PATH}-wal`,
      `${process.env.TISLY_DB_PATH}-shm`,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await surveyorLogin();
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "請求番号テスト",
        address: "茨城県守谷市",
        surveyDate: "2026-06-19",
      });

    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    businessProjectId = est.body.businessProjectId;
    estimateNo = est.body.estimate.estimateNo;
  });

  after(() => closeDatabase());

  it("見積から請求を作成 — INV- 番号 + estimateNo 紐付け", async () => {
    const res = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.match(res.body.invoice.invoiceNo, INV_NO_RE);
    assert.equal(res.body.invoice.estimateRefNo, estimateNo);

    const inv = getInvoice(res.body.invoice.id);
    assert.ok(inv);
    assert.match(inv.invoiceNo, INV_NO_RE);
    assert.equal(inv.estimateRefNo, estimateNo);
    assert.match(resolveTomsBankInfo(inv.bankInfo), /トムズ/);
  });

  it("請求書 PDF 生成で storage_documents 履歴が作られる", async () => {
    const pdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?includePhotos=false`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);

    const rows = getDatabase()
      .prepare(
        `SELECT * FROM storage_documents_v1 WHERE project_id = ? AND document_type = 'invoice' ORDER BY created_at DESC LIMIT 1`
      )
      .all(businessProjectId) as Array<Record<string, unknown>>;
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].status, "qnap_pending");
  });

  it("会社名は株式会社TOMS", () => {
    assert.equal(getTomsCompanyInfo().name, "株式会社TOMS");
  });

  it("既定口座名義はトムズ", () => {
    assert.match(TOMS_DEFAULT_BANK_INFO, /トムズ/);
  });
});
