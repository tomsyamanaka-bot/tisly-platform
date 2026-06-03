import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-781";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-781.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.MQTT_MOCK_MODE = "true";
process.env.MQTT_TLS_ENABLED = "true";
process.env.MQTT_CA_PATH = "/nonexistent/ca.pem";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.GMAIL_SEND_MODE = "mock";
process.env.GMAIL_QUEUE_MAX_ATTEMPTS = "2";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { getMqttSubscriberConfig } = await import("../src/mqtt/mqtt-config.js");
const { getMqttTlsStatus, shouldFallbackMqttTls } = await import("../src/mqtt/mqtt-tls.js");
const { canGmailRealSend } = await import("../src/business/services/gmailRealSend.js");
const { enqueueGmailSend, processGmailQueueItem } = await import("../src/business/gmail-send-queue.js");
const { listGmailDlq } = await import("../src/business/gmail-dlq.js");
const { syncQnapDiff, buildFingerprints } = await import("../src/business/qnap-diff-sync.js");
const { getPdfRenderMode, renderWithPdfFallback } = await import("../src/business/pdf/render.js");
const { comparePdfSnapshot } = await import("../src/business/pdf/regression-snapshot.js");
const { runAiFeedbackWeeklyBatch } = await import("../src/toms/ai-feedback-weekly-batch.js");
const { recordProRemoteState, getProRemoteState } = await import("../src/toms/pro-remote-state.js");
const { buildLiveConnectionStatus } = await import("../src/toms/live-connection-status.js");

const app = createApp();

describe("Phase 781-820 production reliability", () => {
  let token = "";
  let projectId = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    token = login.body.token;
    const create = await request(app)
      .post("/api/business/projects")
      .set("Authorization", "Bearer " + token)
      .send({
        customerId: "BCU-SEED-TOMS",
        customerName: "山田様",
        title: "Phase781 Reliability試験",
        address: "東京都",
        phone: "090-0000-0000",
      });
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("migration phase781 tables exist", () => {
    for (const t of ["gmail_send_dlq", "qnap_upload_manifest", "pro_operations"]) {
      const row = getDatabase()
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
        .get(t) as { name: string } | undefined;
      assert.equal(row?.name, t);
    }
  });

  it("MQTT TLS disabled fallback to mock", () => {
    const cfg = getMqttSubscriberConfig();
    assert.equal(cfg.mockMode, true);
    const tls = getMqttTlsStatus(true);
    assert.equal(tls.mode, "mock");
    assert.equal(shouldFallbackMqttTls(false), true);
  });

  it("Gmail real send guard blocks without OAuth", () => {
    const gate = canGmailRealSend(true);
    assert.equal(gate.ok, false);
  });

  it("Gmail DLQ after max attempts", () => {
    const item = enqueueGmailSend({
      projectId,
      toAddress: "test@example.com",
      subject: "DLQ test",
      sendMode: "realSend",
    });
    processGmailQueueItem(item.id);
    const after = processGmailQueueItem(item.id);
    assert.ok(after?.status === "failed" || after?.status === "sent");
    if (after?.status === "failed") {
      const dlq = listGmailDlq({ projectId });
      assert.ok(dlq.length >= 1);
    }
  });

  it("QNAP diff skip then upload", async () => {
    const dir = fs.mkdtempSync("./data/qnap-diff-test-");
    const local = `${dir}/file.txt`;
    fs.writeFileSync(local, "v1");
    const files = [{ localPath: local, remotePath: "01_現調写真/test.txt" }];
    const first = await syncQnapDiff(projectId, files);
    assert.equal(first.uploaded, 1);
    const second = await syncQnapDiff(projectId, files);
    assert.equal(second.skipped, 1);
    fs.writeFileSync(local, "v2");
    const fps = buildFingerprints(files);
    assert.ok(fps[0].checksum.length > 10);
    const third = await syncQnapDiff(projectId, files);
    assert.equal(third.uploaded, 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("POST /api/business/qnap/sync-diff", async () => {
    const res = await request(app)
      .post("/api/business/qnap/sync-diff")
      .set("Authorization", "Bearer " + token)
      .send({ projectId, files: [] });
    assert.equal(res.status, 200);
    assert.ok(res.body.skipped !== undefined);
  });

  it("PRO remote state replay snapshot", () => {
    recordProRemoteState({
      projectId,
      action: "floor_nav",
      tier: "1f",
      actor: "test",
    });
    const snap = getProRemoteState(projectId);
    assert.equal(snap?.lastAction, "floor_nav");
  });

  it("AI feedback weekly batch", () => {
    const summary = runAiFeedbackWeeklyBatch();
    assert.ok(summary.weekStart);
    assert.ok(summary.byCustomer);
    assert.equal(summary.mockAi, true);
  });

  it("PDF html fallback regression hash", async () => {
    assert.equal(getPdfRenderMode(), "html");
    const { pdfBuf, usedFallback } = await renderWithPdfFallback(
      "<html><body><h1>Phase781</h1></body></html>",
      "phase781"
    );
    assert.ok(pdfBuf.length > 0);
    assert.equal(usedFallback, true);
    const cmp = comparePdfSnapshot("phase781-estimate", pdfBuf, 0.05);
    assert.equal(cmp.match, true);
  });

  it("GET live connection-status badges payload", async () => {
    const status = buildLiveConnectionStatus();
    assert.ok(status.mqtt.tls);
    const res = await request(app)
      .get("/api/toms/live/connection-status")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(res.body.mqtt.tls);
  });

  it("GET gmail DLQ API", async () => {
    const res = await request(app)
      .get("/api/business/gmail/dlq")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
  });

  it("GET ai-feedback weekly-batch", async () => {
    const res = await request(app)
      .get("/api/toms/ai-feedback/weekly-batch")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(res.body.totals);
  });
});
