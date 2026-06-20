import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-ai-estimate-v2";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-ai-estimate-engine-v2.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER_MOCK = "true";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  calcWireLengthMeters,
  DEFAULT_MM_PER_PX,
  WIRE_WASTE_FACTOR,
  applyPreviewLineEditsV2,
  buildAiEstimateCandidatesV2,
  extractAiEstimatePreviewV2FromExport,
} = await import("../src/master/ai-estimate-engine-v2.js");
const { AI_ESTIMATE_ENGINE_V2_SCHEMA } = await import("../src/master/master-v1-types.js");

const app = createApp();

describe("AI見積エンジン v2", () => {
  let token = "";
  let sketchId = "";

  before(async () => {
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.surveyor",
        password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
      });
    token = login.body.token;
    assert.ok(token);
  });

  after(() => {
    closeDatabase();
  });

  it("calcWireLengthMeters — 余長1.2×・切り上げ", () => {
    assert.equal(calcWireLengthMeters(100, 2, 1.2), 1);
    assert.equal(calcWireLengthMeters(1000, 2, 1.2), 3);
    assert.equal(calcWireLengthMeters(0), 0);
  });

  it("extractAiEstimatePreviewV2FromExport — 記号・配線・v2フィールド", () => {
    const preview = extractAiEstimatePreviewV2FromExport(
      {
        schemaVersion: 2,
        drawingVersion: 2,
        exportedAt: new Date().toISOString(),
        projectId: "test-proj",
        sketchId: "test-sketch",
        title: "t",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canvas: { width: 800, height: 600 },
        backgroundImage: null,
        viewport: { scale: 1, offsetX: 0, offsetY: 0 },
        paths: [
          {
            id: "p1",
            tool: "route",
            lineType: "lan",
            color: "#2563eb",
            width: 3,
            points: [{ x: 0, y: 0 }, { x: 500, y: 0 }],
            lengthPx: 500,
          },
        ],
        symbols: [
          {
            id: "s1",
            symbolType: "dome_camera",
            label: "ドーム",
            icon: "📷",
            color: "#2563eb",
            x: 1,
            y: 1,
            rotation: 0,
            scale: 1,
            memo: "",
          },
          {
            id: "s2",
            symbolType: "unknown_symbol",
            label: "未知",
            icon: "?",
            color: "#000",
            x: 2,
            y: 2,
            rotation: 0,
            scale: 1,
            memo: "",
          },
        ],
        notes: [],
        sketchNotes: "",
      },
      "test-sketch"
    );

    assert.equal(preview.schemaVersion, AI_ESTIMATE_ENGINE_V2_SCHEMA);
    assert.equal(preview.mmPerPx, DEFAULT_MM_PER_PX);
    assert.equal(preview.wasteFactor, WIRE_WASTE_FACTOR);
    assert.ok(preview.workLines.length >= 1);
    assert.ok(preview.materialLines.length >= 1);
    assert.ok(preview.unmappedLines.length >= 1);
    assert.ok(preview.warnings.length >= 1);
    assert.ok(preview.sources.length >= 1);
    const lanMat = preview.materialLines.find((l) => l.label.includes("LAN") || l.symbolType === "lan");
    assert.ok(lanMat);
    assert.ok(lanMat!.qty >= 1);
  });

  it("applyPreviewLineEditsV2 — ON/OFF・数量・単価", () => {
    const base = extractAiEstimatePreviewV2FromExport(
      {
        schemaVersion: 2,
        drawingVersion: 2,
        exportedAt: new Date().toISOString(),
        projectId: "p",
        sketchId: "s",
        title: "t",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canvas: { width: 800, height: 600 },
        backgroundImage: null,
        viewport: { scale: 1, offsetX: 0, offsetY: 0 },
        paths: [],
        symbols: [
          {
            id: "s1",
            symbolType: "dome_camera",
            label: "ドーム",
            icon: "📷",
            color: "#2563eb",
            x: 1,
            y: 1,
            rotation: 0,
            scale: 1,
            memo: "",
          },
        ],
        notes: [],
        sketchNotes: "",
      },
      "s"
    );
    const lineKey = base.workLines[0]?.lineKey;
    assert.ok(lineKey);
    const edited = applyPreviewLineEditsV2(base, [
      { lineKey, qty: 2, appliedUnitSell: 99999, enabled: true },
    ]);
    const line = edited.workLines.find((l) => l.lineKey === lineKey);
    assert.equal(line?.qty, 2);
    assert.equal(line?.appliedUnitSell, 99999);
    assert.ok(edited.totalSell >= 99999);
  });

  it("GET /api/master/v1/estimate-preview — v2 デフォルト", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "AI見積v2テスト様",
        siteName: "v2候補現場",
        address: "茨城県守谷市",
        workTypes: ["camera"],
      });
    assert.equal(survey.status, 201);
    const projectId = survey.body.projectId;

    const sketchRes = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "v2テスト図面" });
    sketchId = sketchRes.body.sketch.id;

    await request(app)
      .patch(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        layers: {
          schemaVersion: 2,
          drawingVersion: 2,
          canvasWidth: 800,
          canvasHeight: 600,
          paths: [
            {
              id: "p1",
              tool: "route",
              lineType: "lan",
              color: "#2563eb",
              width: 3,
              points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
              lengthPx: 200,
            },
          ],
          symbols: [
            {
              id: "s1",
              symbolType: "nvr",
              label: "NVR",
              icon: "💾",
              color: "#0d9488",
              x: 50,
              y: 50,
              rotation: 0,
              scale: 1,
              memo: "",
            },
          ],
          notes: [],
          viewport: { scale: 1, offsetX: 0, offsetY: 0 },
        },
      });

    const preview = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.schemaVersion, AI_ESTIMATE_ENGINE_V2_SCHEMA);
    assert.ok(Array.isArray(preview.body.unmappedLines));
    assert.ok(Array.isArray(preview.body.warnings));
    assert.ok(Array.isArray(preview.body.sources));
    assert.ok(preview.body.templateLines?.length >= 1 || preview.body.workLines.length >= 2);
  });

  it("draft保存 → 見積反映", async () => {
    assert.ok(sketchId);
    const preview = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    const saved = await request(app)
      .post("/api/master/v1/estimate-preview/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ sketchId, preview: preview.body });
    assert.equal(saved.status, 201);

    const apply = await request(app)
      .post(`/api/master/v1/estimate-drafts/${saved.body.draft.id}/apply-to-estimate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "create" });
    assert.equal(apply.status, 201);
    assert.ok(apply.body.businessProjectId);
    assert.ok(apply.body.detail.estimate?.items?.length >= 1);
  });

  it("GET /api/ai-estimate-engine/v1/candidates-v2", async () => {
    assert.ok(sketchId);
    const res = await request(app)
      .get(`/api/ai-estimate-engine/v1/candidates-v2?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.schemaVersion, AI_ESTIMATE_ENGINE_V2_SCHEMA);
    const direct = buildAiEstimateCandidatesV2({ sketchId });
    assert.ok(direct);
  });
});
