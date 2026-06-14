import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-phase601";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-business-phase601.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { createDrawingPlan, listDrawingSymbols } = await import("../src/business/drawing-store.js");
const {
  createEstimateCandidateFromDrawingPlan,
  summarizeRoutesFromDrawing,
} = await import("../src/business/services/estimateFromDrawingService.js");
const {
  generateQnapSpecificationFilePath,
  generateQnapSpecificationFolderPath,
} = await import("../src/business/services/qnapService.js");
const { getGmailSendMode, canGmailRealSend } = await import("../src/business/services/gmailRealSend.js");
const { getQnapUploadConfig } = await import("../src/business/services/qnapBusinessArchive.js");
const { buildProjectFolderList } = await import("../src/business/services/qnapProjectFolders.js");
const { renderEstimateHtml } = await import("../src/business/services/estimatePdfTemplate.js");

const app = createApp();

describe("Phase 601-620 drawing PWA and real integration foundations", () => {
  let token = "";
  let projectId = "";
  let planId = "";
  let mailDraftId = "";

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
    const create = await request(app)
      .post("/api/business/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: "BCU-SEED-TOMS",
        customerName: "山田様",
        title: "施工図試験",
      });
    projectId = create.body.project.id;
    const plan = createDrawingPlan({ projectId, title: "1F施工図" });
    planId = plan.id;
    await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ name: "カメラ", quantity: 1, unitPrice: 30000, unit: "台" }] });
    const mail = await request(app)
      .post(`/api/business/projects/${projectId}/mail/estimate-ready`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    mailDraftId = mail.body.mail?.id ?? "";
  });

  after(() => closeDatabase());

  it("seeds drawing symbols", () => {
    const symbols = listDrawingSymbols("security_camera");
    assert.ok(symbols.length >= 6);
    assert.ok(symbols.some((s) => s.label === "カメラ"));
  });

  it("creates DrawingPlan via API", async () => {
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/drawing-plans`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "2F", tradeType: "internet" });
    assert.equal(res.status, 201);
    assert.equal(res.body.plan.projectId, projectId);
  });

  it("aggregates DrawingRoute lengths", () => {
    const plan = createDrawingPlan({ projectId, title: "route-test" });
    const updated = {
      ...plan,
      routes: [
        {
          id: "r1",
          routeType: "lan" as const,
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
          color: "#0f0",
          lineStyle: "solid",
          estimatedLength: 80,
          memo: "",
        },
      ],
      symbols: [
        {
          id: "s1",
          symbolId: listDrawingSymbols()[0].id,
          x: 10,
          y: 10,
          rotation: 0,
          label: "カメラ",
          memo: "",
          linkedPhotoIds: [],
        },
        {
          id: "s2",
          symbolId: listDrawingSymbols()[0].id,
          x: 20,
          y: 20,
          rotation: 0,
          label: "カメラ",
          memo: "",
          linkedPhotoIds: [],
        },
        {
          id: "s3",
          symbolId: listDrawingSymbols()[0].id,
          x: 30,
          y: 30,
          rotation: 0,
          label: "カメラ",
          memo: "",
          linkedPhotoIds: [],
        },
        {
          id: "s4",
          symbolId: listDrawingSymbols()[0].id,
          x: 40,
          y: 40,
          rotation: 0,
          label: "カメラ",
          memo: "",
          linkedPhotoIds: [],
        },
      ],
    };
    const routes = summarizeRoutesFromDrawing(updated);
    assert.equal(routes[0].quantity, 80);
    const candidate = createEstimateCandidateFromDrawingPlan(updated);
    assert.ok(candidate.lines.some((l) => l.name.includes("カメラ") && l.quantity === 4));
    assert.ok(candidate.lines.some((l) => l.name.includes("LAN")));
  });

  it("generates estimate candidate from drawing API", async () => {
    await request(app)
      .patch(`/api/business/drawing-plans/${planId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        symbols: [
          {
            id: "p1",
            symbolId: listDrawingSymbols("security_camera")[0].id,
            x: 50,
            y: 50,
            rotation: 0,
            label: "カメラ",
            memo: "",
            linkedPhotoIds: [],
          },
        ],
      });
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/drawing-plans/${planId}/estimate-candidate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.ok(res.body.candidate.lines.length >= 1);
  });

  it("generates specification PDF stub", async () => {
    const res = await request(app)
      .post(`/api/business/projects/${projectId}/specification/generate-pdf`)
      .set("Authorization", `Bearer ${token}`)
      .send({ drawingPlanId: planId });
    assert.equal(res.status, 201);
    assert.match(res.body.qnapPath, /07_仕様書\/仕様書_/);
    assert.ok(res.body.document.pdfPath);
  });

  it("builds QNAP 07_仕様書 path", async () => {
    const project = (
      await request(app)
        .get(`/api/business/projects/${projectId}`)
        .set("Authorization", `Bearer ${token}`)
    ).body.project;
    const folder = generateQnapSpecificationFolderPath(project);
    const file = generateQnapSpecificationFilePath(project);
    assert.match(folder, /07_仕様書\/$/);
    assert.match(file, /仕様書_.*山田様.*施工図試験\.pdf$/);
  });

  it("blocks Gmail real send without confirmed", async () => {
    assert.equal(getGmailSendMode(), "mock");
    const gate = canGmailRealSend(false);
    assert.equal(gate.ok, false);
    if (!mailDraftId) return;
    const res = await request(app)
      .post("/api/business/google/gmail/send-real")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId, mailDraftId, confirmed: false, mode: "real" });
    assert.equal(res.status, 403);
  });

  it("Gmail send-real mock mode skips delivery", async () => {
    if (!mailDraftId) return;
    const res = await request(app)
      .post("/api/business/google/gmail/send-real")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId, mailDraftId, confirmed: true, mode: "mock" });
    assert.equal(res.status, 200);
    assert.equal(res.body.processedMode, "mock");
    assert.equal(res.body.preview.to, "toms.yamanaka@gmail.com");
  });

  it("blocks QNAP real upload without confirmed", async () => {
    const prev = process.env.QNAP_UPLOAD_MODE;
    process.env.QNAP_UPLOAD_MODE = "real";
    process.env.QNAP_WEBDAV_URL = "https://qnap.example/dav";
    process.env.QNAP_USERNAME = "toms";
    assert.equal(getQnapUploadConfig().mode, "real");
    const res = await request(app)
      .post("/api/business/qnap/upload-file-real")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        remotePath: "/TOMS/案件/2026/test/file.pdf",
        confirmed: false,
        mode: "real",
      });
    assert.equal(res.status, 403);
    process.env.QNAP_UPLOAD_MODE = prev ?? "mock";
  });

  it("creates QNAP project folders in mock mode", async () => {
    const project = (
      await request(app)
        .get(`/api/business/projects/${projectId}`)
        .set("Authorization", `Bearer ${token}`)
    ).body.project;
    const folders = buildProjectFolderList(project);
    assert.equal(folders.length, 7);
    assert.ok(folders.some((f) => f.includes("07_仕様書")));
    const res = await request(app)
      .post("/api/business/qnap/create-project-folders")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId, mode: "mock" });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "created");
  });

  it("PDF template v3 re-exports estimate html", async () => {
    const project = (
      await request(app)
        .get(`/api/business/projects/${projectId}`)
        .set("Authorization", `Bearer ${token}`)
    ).body.project;
    const est = (
      await request(app)
        .get(`/api/business/projects/${projectId}/pdf/estimate`)
        .set("Authorization", `Bearer ${token}`)
    );
    assert.equal(est.status, 200);
    assert.match(est.text, /お見積書/);
    const estimate = project.estimateId
      ? (
          await import("../src/business/business-store.js")
        ).getEstimate(project.estimateId)
      : null;
    if (estimate) {
      const html = renderEstimateHtml(project, estimate);
      assert.match(html, /お見積書/);
    }
  });
});
