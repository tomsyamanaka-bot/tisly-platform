import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-qnap-pdf-backup-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-qnap-pdf-backup-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_STORAGE_MOCK = "true";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { runQnapPdfBackupWorkerTick } = await import("../src/workers/qnap-pdf-backup-worker.js");
const { buildQnapPdfRemotePath } = await import("../src/projects/project-pdf-qnap-store.js");

const app = createApp();

async function ownerLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.owner", password: "demo-remote-2026" });
}

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

async function enableQnapBackup(token: string) {
  const res = await request(app)
    .put("/api/storage/v1/settings")
    .set("Authorization", `Bearer ${token}`)
    .send({
      qnapBackupEnabled: true,
      qnap: {
        host: "192.168.1.100",
        port: 8080,
        shareName: "TiSLY",
        username: "tisly",
        password: "test-pass",
      },
    });
  assert.equal(res.status, 200, res.body?.error);
}

describe("QNAP PDF 自動バックアップ v1", () => {
  let ownerToken = "";
  let surveyorToken = "";
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

    const owner = await ownerLogin();
    assert.equal(owner.status, 200, owner.body?.error);
    ownerToken = owner.body.token;

    const surveyor = await surveyorLogin();
    assert.equal(surveyor.status, 200, surveyor.body?.error);
    surveyorToken = surveyor.body.token;

    await enableQnapBackup(ownerToken);

    const est = await request(app)
      .post("/api/estimate/v1/standalone-estimate")
      .set("Authorization", `Bearer ${surveyorToken}`)
      .send({
        addressee: "QNAPテスト商事",
        subject: "QNAPバックアップテスト",
        workLocation: "東京都テスト区",
        items: [{ name: "防犯カメラ設置", quantity: 1, unitPrice: 88000 }],
      });
    assert.equal(est.status, 201, est.body?.error);
    businessProjectId = est.body.businessProjectId;

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${surveyorToken}`)
      .send({});

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${surveyorToken}`)
      .send({});

    const reportRes = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/completion-report/create`)
      .set("Authorization", `Bearer ${surveyorToken}`)
      .send({});
    assert.equal(reportRes.status, 201, reportRes.body?.error);

    const tick = await runQnapPdfBackupWorkerTick();
    assert.ok(tick.processed >= 3, `worker processed ${tick.processed}`);
  });

  after(() => closeDatabase());

  it("1. QNAP有効時 — 見積PDFがモックQNAPへ送信される", async () => {
    const pdfs = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(pdfs.status, 200);
    const estimate = pdfs.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    assert.equal(estimate.qnap.status, "success", estimate.qnap?.error);
    assert.match(estimate.qnap.path, /\/TiSLY\/projects\/.+\/estimate\/estimate-.*\.pdf/);
    const remote = path.join(
      process.cwd(),
      "uploads",
      "qnap-storage-mock",
      "TiSLY",
      buildQnapPdfRemotePath(businessProjectId, estimate.fileName, "estimate")
    );
    assert.ok(fs.existsSync(remote), remote);
  });

  it("2. 請求PDFも送信される", async () => {
    const pdfs = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const invoice = pdfs.body.pdfs.find((p: { kind: string }) => p.kind === "invoice");
    assert.equal(invoice.qnap.status, "success");
    assert.match(invoice.fileName, /^invoice-.*\.pdf$/);
  });

  it("3. 報告書PDFも送信される", async () => {
    const pdfs = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const report = pdfs.body.pdfs.find((p: { kind: string }) => p.kind === "report");
    assert.equal(report.qnap.status, "success");
    assert.match(report.fileName, /^completion-report-.*\.pdf$/);
  });

  it("4. QNAP失敗時でもローカルPDFは開ける", async () => {
    const estimatePdf = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const est = estimatePdf.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    getDatabase()
      .prepare(
        `UPDATE project_pdf_meta SET qnap_backup_status = 'failed', qnap_backup_error = 'mock'
         WHERE project_id = ? AND kind = 'estimate'`
      )
      .run(businessProjectId);

    const fileRes = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs/estimate/file`)
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(fileRes.status, 200);
    assert.match(String(fileRes.headers["content-type"]), /pdf/i);
    assert.ok(est.exists);
  });

  it("5. 失敗時に再同期できる", async () => {
    getDatabase()
      .prepare(
        `UPDATE project_pdf_meta SET qnap_backup_status = 'failed', qnap_backup_attempts = 3, qnap_backup_error = 'mock fail'
         WHERE project_id = ? AND kind = 'invoice'`
      )
      .run(businessProjectId);

    const resync = await request(app)
      .post(`/api/projects/v1/projects/${businessProjectId}/pdfs/invoice/qnap-resync`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    assert.equal(resync.status, 200);
    const invoice = resync.body.pdfs.find((p: { kind: string }) => p.kind === "invoice");
    assert.equal(invoice.qnap.status, "success");
  });

  it("6. QNAP無効時はローカル保存のみ", async () => {
    await request(app)
      .put("/api/storage/v1/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ qnapBackupEnabled: false });

    const est2 = await request(app)
      .post("/api/estimate/v1/standalone-estimate")
      .set("Authorization", `Bearer ${surveyorToken}`)
      .send({
        addressee: "ローカルのみ",
        subject: "QNAP無効テスト",
        workLocation: "東京都",
        items: [{ name: "作業", quantity: 1, unitPrice: 10000 }],
      });
    assert.equal(est2.status, 201);
    const pid = est2.body.businessProjectId;
    await request(app)
      .post(`/api/estimate/v1/projects/${pid}/finalize`)
      .set("Authorization", `Bearer ${surveyorToken}`)
      .send({});

    const pdfs = await request(app)
      .get(`/api/projects/v1/projects/${pid}/pdfs`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const estimate = pdfs.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    assert.equal(estimate.local.saved, true);
    assert.equal(estimate.qnap.label, "未設定");
    assert.equal(estimate.qnap.enabled, false);
  });

  it("7. 共有URL用PDF取得は従来通り", async () => {
    const res = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs/invoice/file`)
      .set("Authorization", `Bearer ${surveyorToken}`);
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-type"]), /pdf/i);
  });

  it("8. 削除時はQNAP状態も論理削除", async () => {
    const del = await request(app)
      .delete(`/api/projects/v1/projects/${businessProjectId}/pdfs/report`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(del.status, 200);
    const row = getDatabase()
      .prepare(`SELECT deleted_at FROM project_pdf_meta WHERE project_id = ? AND kind = 'report'`)
      .get(businessProjectId) as { deleted_at: string | null } | undefined;
    assert.ok(row?.deleted_at, "meta soft deleted");
  });

  it("surveyor は QNAP エラー詳細を見れない", async () => {
    getDatabase()
      .prepare(
        `UPDATE project_pdf_meta SET qnap_backup_status = 'failed', qnap_backup_error = 'secret error'
         WHERE project_id = ? AND kind = 'estimate' AND deleted_at IS NULL`
      )
      .run(businessProjectId);

    const ownerPdfs = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const ownerEst = ownerPdfs.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    assert.equal(ownerEst.qnap.error, "secret error");

    const surveyorPdfs = await request(app)
      .get(`/api/projects/v1/projects/${businessProjectId}/pdfs`)
      .set("Authorization", `Bearer ${surveyorToken}`);
    const surveyorEst = surveyorPdfs.body.pdfs.find((p: { kind: string }) => p.kind === "estimate");
    assert.equal(surveyorEst.qnap.error, null);
  });

  it("QNAP PDF 整合チェック API", async () => {
    const integrity = await request(app)
      .get("/api/storage/v1/settings/qnap/integrity")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(integrity.status, 200);
    assert.equal(typeof integrity.body.localPdfCount, "number");
    assert.equal(typeof integrity.body.qnapSuccessCount, "number");
    assert.equal(typeof integrity.body.mismatch, "boolean");
  });
});
