import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-business-521";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-521.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { generateQnapProjectPath, generateQnapFilePath } = await import(
  "../src/business/services/qnapService.js"
);
const {
  createSurveyCalendarDraft,
  createConstructionCalendarDraft,
  createPaymentCalendarDraft,
} = await import("../src/business/services/googleCalendarService.js");
const { createEstimateMailDraft, createInvoiceAndReportMailDraft } = await import(
  "../src/business/services/gmailService.js"
);
const { canTransitionStatus, assertTransition } = await import(
  "../src/business/business-status.js"
);
const { calcTotals, applyPricingTierToItems, normalizeLineItems } = await import(
  "../src/business/estimate-math.js"
);
const { DEFAULT_MAIL_TO } = await import("../src/business/business-types.js");

const app = createApp();

describe("Phase 521-540 TOMS business PWA foundation", () => {
  let token = "";
  let projectId = "";
  let customerId = "BCU-SEED-TOMS";

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
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        customerName: "山田様",
        title: "防犯カメラ設置工事",
        address: "東京都千代田区1-1",
        phone: "090-1111-2222",
      });
    assert.equal(create.status, 201);
    projectId = create.body.project.id;
  });

  after(() => closeDatabase());

  it("generates QNAP project and file paths", () => {
    const project = {
      id: "BIZ-TEST",
      projectNo: "PRJ-2026-0015",
      customerName: "山田様",
      title: "防犯カメラ設置工事",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    const base = generateQnapProjectPath(project);
    assert.match(base, /^\/TOMS\/business\/山田様\/BIZ-TEST\/$/);
    const est = generateQnapFilePath(project, "estimate", "EST-2026-0015");
    assert.ok(est.includes("/estimate/"));
    assert.ok(est.endsWith(".pdf"));
  });

  it("validates project status transitions", () => {
    assert.ok(canTransitionStatus("new", "survey_scheduled"));
    assert.ok(!canTransitionStatus("new", "paid"));
    assert.throws(() => assertTransition("new", "paid"));
  });

  it("creates Google CalendarDraft stubs", async () => {
    const detail = await request(app)
      .get(`/api/business/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    const project = detail.body.project;
    project.surveySchedule = { date: "2026-06-10", memo: "現調" };
    const surveyDraft = createSurveyCalendarDraft(project);
    assert.equal(surveyDraft.type, "survey");
    assert.ok(surveyDraft.start.includes("2026-06-10"));

    project.constructionSchedule = { date: "2026-06-20" };
    project.requiredMaterials = "カメラ2台";
    const consDraft = createConstructionCalendarDraft(project);
    assert.equal(consDraft.type, "construction");
    assert.ok(consDraft.description.includes("必要部材"));

    project.paymentDueDate = "2026-07-31";
    const payDraft = createPaymentCalendarDraft(project);
    assert.equal(payDraft.type, "payment");
  });

  it("creates Gmail MailDraft stubs with default recipient", async () => {
    const items = normalizeLineItems([
      { name: "防犯カメラ outdoor", category: "camera", quantity: 2, unitPrice: 45000 },
    ]);
    const totals = calcTotals(items);
    const est = {
      id: "est-1",
      estimateNo: "EST-2026-0099",
      customerName: "山田様",
      title: "防犯カメラ設置工事",
      items,
      ...totals,
      pdfPath: null,
    };
    const detail = await request(app)
      .get(`/api/business/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    const mail = createEstimateMailDraft(detail.body.project, est);
    assert.equal(mail.to, DEFAULT_MAIL_TO);
    assert.ok(mail.subject.includes("見積確認"));
    assert.ok(mail.attachmentPaths.length >= 1);

    const inv = { ...est, invoiceNo: "INV-2026-0099", bankInfo: "test", paymentDueDate: "2026-07-31" };
    const rep = {
      id: "rep-1",
      title: "完了報告",
      beforePhotos: [],
      afterPhotos: [],
      workMemo: "完了",
      pdfPath: null,
    };
    const mail2 = createInvoiceAndReportMailDraft(detail.body.project, inv, rep);
    assert.equal(mail2.to, DEFAULT_MAIL_TO);
    assert.ok(["invoice_and_report_to_owner", "invoice_ready"].includes(mail2.type));
  });

  it("calculates estimate totals", () => {
    const items = normalizeLineItems([
      { name: "A", quantity: 2, unitPrice: 10000, costPrice: 5000 },
      { name: "B", quantity: 1, unitPrice: 5000, costPrice: 3000 },
    ]);
    const t = calcTotals(items);
    assert.equal(t.subtotal, 25000);
    assert.equal(t.tax, 2500);
    assert.equal(t.total, 27500);
    assert.equal(t.internalCost, 13000);
    assert.equal(t.grossProfit, 12000);
  });

  it("creates invoice from estimate via API", async () => {
    const pricing = await request(app)
      .get("/api/business/pricing")
      .set("Authorization", `Bearer ${token}`);
    const tierItems = pricing.body.tiers[0]?.items ?? [];
    const lines = applyPricingTierToItems(
      [{ name: "防犯カメラ outdoor", category: "camera", quantity: 1 }],
      tierItems
    );
    assert.ok(lines[0].unitPrice > 0);

    const estRes = await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: lines });
    assert.equal(estRes.status, 201);
    assert.ok(estRes.body.estimate.total > 0);

    const invRes = await request(app)
      .post(`/api/business/projects/${projectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentDueDate: "2026-08-31" });
    assert.equal(invRes.status, 200);
    assert.equal(invRes.body.invoice.total, estRes.body.estimate.total);
    assert.equal(invRes.body.invoice.items.length, estRes.body.estimate.items.length);
  });

  it("applies customer pricing tier to estimate lines", () => {
    const tierItems = [
      {
        id: "1",
        category: "camera",
        name: "防犯カメラ outdoor",
        unit: "台",
        defaultUnitPrice: 45000,
        costPrice: 28000,
        taxType: "standard",
        memo: "",
      },
    ];
    const lines = applyPricingTierToItems(
      [{ name: "防犯カメラ outdoor", category: "camera", quantity: 3 }],
      tierItems
    );
    assert.equal(lines[0].unitPrice, 45000);
    assert.equal(lines[0].amount, 135000);
  });

  it("exposes business workflow on pwa hub", async () => {
    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(hub.status, 200);
    const wf = hub.body.workflows || [];
    assert.ok(wf.some((w: { id: string }) => w.id === "business_pwa"));
    assert.ok(wf.some((w: { id: string }) => w.id === "business_estimate_pending"));
    const apps = hub.body.apps || [];
    assert.ok(apps.some((a: { id: string }) => a.id === "business"));
  });
});
