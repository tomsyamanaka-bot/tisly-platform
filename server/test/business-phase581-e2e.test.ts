import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-phase581-e2e";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-phase581-e2e.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.QNAP_UPLOAD_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { createSurveyProject } = await import("../src/survey/survey-store.js");

const app = createApp();

describe("Phase 581-600 business E2E flow", () => {
  let token = "";
  let projectId = "";
  let surveyProjectId = "";

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
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    token = login.body.token;

    const survey = createSurveyProject({
      customerCode: "TOMS001",
      siteName: "Phase581 E2E現調",
      address: "東京都",
    });
    surveyProjectId = survey.projectId;

    const fromSurvey = await request(app)
      .post(`/api/business/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(fromSurvey.status, 201);
    projectId = fromSurvey.body.project.id;
  });

  after(() => closeDatabase());

  it("runs survey → business → estimate pdf → google mock → qnap → payment → accounting → logs", async () => {
    const est = await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ name: "設置", quantity: 1, unitPrice: 50000, unit: "式" }] });
    assert.equal(est.status, 201);

    const pdf = await request(app)
      .get(`/api/business/projects/${projectId}/pdf/estimate`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.text, /御見積書/);

    const cal = await request(app)
      .post("/api/business/google/calendar/create")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        title: "E2E現調",
        start: "2026-07-01T09:00:00",
        end: "2026-07-01T10:00:00",
      });
    assert.equal(cal.status, 200);
    assert.ok(cal.body.eventId);

    const draft = await request(app)
      .post("/api/business/google/gmail/draft")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        to: "test@example.com",
        subject: "見積送付",
        body: "E2E draft",
      });
    assert.equal(draft.status, 200);

    await request(app)
      .post(`/api/business/projects/${projectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentDueDate: "2026-08-01" });

    const invSent = await request(app)
      .post(`/api/business/projects/${projectId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "invoice_sent" });
    assert.ok([200, 201].includes(invSent.status));

    const qnap = await request(app)
      .post(`/api/business/projects/${projectId}/qnap/upload`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(qnap.status, 200);
    assert.equal(qnap.body.upload.status, "synced");

    const pay = await request(app)
      .post(`/api/business/projects/${projectId}/payment`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        amount: est.body.estimate?.total ?? 55000,
        paymentDate: "2026-06-20",
        method: "bank_transfer",
      });
    assert.equal(pay.status, 201);
    assert.ok(["paid", "partial_paid", "invoice_sent"].includes(pay.body.statusUpdate?.newStatus));

    const acct = await request(app)
      .get("/api/business/accounting/export-csv?format=standard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(acct.status, 200);

    const freee = await request(app)
      .get("/api/business/accounting/export-csv?format=freee")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(freee.status, 200);

    const logs = await request(app)
      .get("/api/business/integration-logs?projectId=" + projectId)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(logs.status, 200);
    assert.ok(logs.body.logs.length >= 1);
  });
});
