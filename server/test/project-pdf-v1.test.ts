import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-pdf-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-pdf-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { buildProjectPdfFileName } = await import("../src/projects/project-pdf-store.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("案件 PDF 管理 v1", () => {
  let token = "";
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
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;

    const est = await request(app)
      .post("/api/estimate/v1/standalone-estimate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        addressee: "テスト商事",
        subject: "PDF管理テスト",
        workLocation: "東京都テスト区",
        items: [{ name: "防犯カメラ設置", quantity: 1, unitPrice: 88000 }],
      });
    assert.equal(est.status, 201, est.body?.error);
    businessProjectId = est.body.businessProjectId;

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const reportRes = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/completion-report/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(reportRes.status, 201, reportRes.body?.error);
    assert.ok(reportRes.body.pdfPath, "報告書PDFパス");
  });

  after(() => closeDatabase());

  it("buildProjectPdfFileName — 標準命名", () => {
    assert.equal(buildProjectPdfFileName("estimate", "EST-2026-0001"), "estimate-EST-2026-0001.pdf");
    assert.equal(buildProjectPdfFileName("invoice", "INV-001"), "invoice-INV-001.pdf");
    assert.equal(buildProjectPdfFileName("report", "PRJ-2026-0001"), "completion-report-PRJ-2026-0001.pdf");
  });

  it("GET /projects/:id/pdfs — 一覧と保存パス", async () => {
    const res = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.storageProvider, "local");
    assert.match(res.body.storageBasePath, new RegExp(`uploads/business/${businessProjectId}/pdfs/`));
    const kinds = res.body.pdfs.map((p: { kind: string }) => p.kind);
    assert.ok(kinds.includes("estimate"));
    assert.ok(kinds.includes("invoice"));
    assert.ok(kinds.includes("report"));
    const estimatePdf = res.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    assert.ok(estimatePdf.exists, "見積PDFが存在すること");
    assert.match(estimatePdf.fileName, /^estimate-.*\.pdf$/);
  });

  it("GET /projects/:id/pdfs/estimate/file — PDF取得", async () => {
    const res = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs/estimate/file`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-type"]), /pdf/i);
  });

  it("物理保存パス uploads/business/{id}/pdfs/", async () => {
    const dir = path.join(process.cwd(), "uploads", "business", businessProjectId, "pdfs");
    assert.ok(fs.existsSync(dir), "pdfs ディレクトリが存在すること");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
    assert.ok(files.some((f) => f.startsWith("estimate-")), files.join(","));
    assert.ok(files.some((f) => f.startsWith("invoice-")), files.join(","));
    assert.ok(files.some((f) => f.startsWith("completion-report-")), files.join(","));
  });

  it("POST regenerate + DELETE pdf", async () => {
    const regen = await request(app)
      .post(`/api/projects/v1/projects/${businessProjectId}/pdfs/estimate/regenerate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(regen.status, 200);
    assert.ok(regen.body.pdf.exists);

    const del = await request(app)
      .delete(`/api/projects/v1/projects/${businessProjectId}/pdfs/estimate`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 200);
    const estimate = del.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    assert.equal(estimate.exists, false);
  });

  it("削除プレビュー → 論理削除 → 復元", async () => {
    const preview = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/delete-preview?source=business`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.estimateCount, 1);
    assert.equal(preview.body.invoiceCount, 1);
    assert.ok(typeof preview.body.pdfCount === "number");

    const del = await request(app)
      .delete(`/api/projects/v1/projects/${businessProjectId}?source=business`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.hadEstimate, true);
    assert.equal(del.body.hadInvoice, true);

    const list = await request(app)
      .get("/api/projects/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(!list.body.projects.some((p: { id: string }) => p.id === businessProjectId));

    const deleted = await request(app)
      .get("/api/projects/v1/projects/deleted")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(deleted.status, 200);
    assert.ok(deleted.body.projects.some((p: { id: string }) => p.id === businessProjectId));

    const restore = await request(app)
      .post(`/api/projects/v1/projects/${businessProjectId}/restore?source=business`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(restore.status, 200);

    const again = await request(app)
      .get("/api/projects/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(again.body.projects.some((p: { id: string }) => p.id === businessProjectId));
  });
});
