import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-741";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-741.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.MQTT_MOCK_MODE = "true";
process.env.LIVE_OPS_MOCK_PUSH = "true";
process.env.QNAP_UPLOAD_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { getPdfRenderMode, renderWithPdfFallback } = await import("../src/business/pdf/render.js");
const {
  aggregateAiFeedbackLearning,
  applyLearningToAiEstimateCandidate,
} = await import("../src/toms/ai-feedback-learning.js");
const { routeMqttToLivePush, isMqttMockMode, isLiveOpsMockPushEnabled } = await import(
  "../src/toms/mqtt-live-push-bridge.js"
);
const { enqueueGmailSend, processGmailQueueBatch } = await import("../src/business/gmail-send-queue.js");
const { exportTomsKpiCsv } = await import("../src/toms/toms-kpi-csv.js");
const { buildHubOfflineSnapshot } = await import("../src/toms/hub-offline-snapshot.js");

const app = createApp();

describe("Phase 741-780 real connection", () => {
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
    assert.equal(login.status, 200);
    token = login.body.token;

    const create = await request(app)
      .post("/api/business/projects")
      .set("Authorization", "Bearer " + token)
      .send({
        customerId: "BCU-SEED-TOMS",
        customerName: "山田様",
        title: "Phase741 Real Conn試験",
        address: "東京都",
        phone: "090-0000-0000",
      });
    assert.equal(create.status, 201);
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("migration phase741 gmail_send_queue exists", () => {
    const row = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = 'gmail_send_queue'`
      )
      .get() as { name: string } | undefined;
    assert.equal(row?.name, "gmail_send_queue");
  });

  it("MQTT mock flags and project topic routing", () => {
    assert.equal(isMqttMockMode(), true);
    assert.equal(isLiveOpsMockPushEnabled(), true);
    const ok = routeMqttToLivePush(
      `tisly/project/${projectId}/devices`,
      JSON.stringify({ devices: [], scrollTier: "1f" })
    );
    assert.equal(ok, true);
  });

  it("GET live connection-status", async () => {
    const res = await request(app)
      .get("/api/toms/live/connection-status")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(res.body.mqtt);
    assert.ok(res.body.gmail);
    assert.ok(res.body.qnap);
  });

  it("POST mock-push stop", async () => {
    const res = await request(app)
      .post("/api/toms/live/mock-push/stop")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.equal(res.body.mockPushRunning, false);
  });

  it("hub offline snapshot sync", async () => {
    const res = await request(app)
      .post("/api/toms/hub/snapshot/sync")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(res.body.snapshot.summary);
    const snap = buildHubOfflineSnapshot("TOMS001");
    assert.ok(typeof snap.summary.todaySurveys === "number");
  });

  it("gmail send queue worker mockOnly", async () => {
    const item = enqueueGmailSend({
      projectId,
      toAddress: "test@example.com",
      subject: "Phase741",
      bodyPreview: "body",
      sendMode: "mockOnly",
    });
    assert.equal(item.status, "pending");
    const batch = processGmailQueueBatch(5);
    assert.ok(batch.processed >= 0);
    const tl = await request(app)
      .get(`/api/toms/projects/${projectId}/timeline`)
      .set("Authorization", "Bearer " + token);
    assert.ok(
      tl.body.entries.some((e: { title: string }) => /Gmail/i.test(e.title))
    );
  });

  it("AI feedback learning aggregate", async () => {
    await request(app)
      .post(`/api/toms/projects/${projectId}/ai-estimate-v3/feedback`)
      .set("Authorization", "Bearer " + token)
      .send({ action: "revised", notes: "単価修正", candidate: { revisedFields: ["unitPrice"] } });
    const res = await request(app)
      .get("/api/toms/ai-feedback/learning?projectId=" + projectId)
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(res.body.stats.total >= 1);
    const stats = aggregateAiFeedbackLearning(projectId);
    assert.ok(stats.revisionRate >= 0);
    const learned = applyLearningToAiEstimateCandidate({ confidence: 0.7 }, projectId);
    assert.ok(learned.aiLearning);
  });

  it("KPI CSV export", async () => {
    const csv = exportTomsKpiCsv();
    assert.ok(csv.includes("customer_id"));
    const res = await request(app)
      .get("/api/toms/kpi/csv")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("revenue"));
  });

  it("PDF html mode and fallback pipeline", async () => {
    assert.equal(getPdfRenderMode(), "html");
    const { pdfBuf, usedFallback } = await renderWithPdfFallback(
      "<html><body>test</body></html>",
      "snapshot-test"
    );
    assert.ok(pdfBuf.length > 100);
    assert.equal(usedFallback, true);
  });

  it("GET gmail-send-queue", async () => {
    const res = await request(app)
      .get("/api/toms/gmail-send-queue")
      .set("Authorization", "Bearer " + token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
  });
});
