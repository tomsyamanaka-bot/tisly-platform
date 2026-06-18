import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-survey-drawing-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-drawing-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  migrateLayersToV2,
  pathLengthPx,
  SURVEY_DRAWING_SCHEMA_VERSION,
} = await import("../src/survey/survey-drawing-v1-types.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("現調図面 v2 型", () => {
  it("v1 レイヤーを v2 にマイグレーションできる", () => {
    const v2 = migrateLayersToV2({
      version: 1,
      strokes: [
        {
          id: "s1",
          tool: "pen",
          color: "#dc2626",
          width: 3,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        },
      ],
      symbols: [],
      textMemos: [{ id: "t1", text: "メモ", x: 5, y: 5, fontSize: 14, color: "#000" }],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    });
    assert.equal(v2.schemaVersion, 2);
    assert.equal(v2.paths.length, 1);
    assert.equal(v2.notes.length, 1);
    assert.equal(v2.paths[0].lengthPx, 10);
  });

  it("パス長を計算できる", () => {
    assert.equal(pathLengthPx([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
  });
});

describe("現調図面 v1 API", () => {
  let token = "";
  let projectId = "";
  let sketchId = "";

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

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "図面テスト様",
        siteName: "方眼紙現場",
        address: "茨城県守谷市",
        surveyDate: "2026-06-18",
      });
    assert.equal(survey.status, 201);
    projectId = survey.body.projectId;
  });

  after(() => closeDatabase());

  it("記号パレットを返す（設備記号ライブラリ v1）", async () => {
    const res = await request(app)
      .get("/api/survey/v1/drawing-sketches/symbols")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.symbols?.length >= 16);
    const dome = res.body.symbols.find((s: { symbolType: string }) => s.symbolType === "dome_camera");
    assert.ok(dome?.svg?.includes("<svg"));
  });

  it("線種パレットを返す", async () => {
    const res = await request(app)
      .get("/api/survey/v1/drawing-sketches/line-types")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.lineTypes.length, 7);
    const lan = res.body.lineTypes.find((l: { id: string }) => l.id === "lan");
    assert.equal(lan.color, "#2563eb");
  });

  it("図面スケッチを作成・一覧・取得できる（v2 構造）", async () => {
    const create = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "1F配線図" });
    assert.equal(create.status, 201);
    sketchId = create.body.sketch.id;
    assert.equal(create.body.sketch.schemaVersion, SURVEY_DRAWING_SCHEMA_VERSION);
    assert.equal(create.body.sketch.layers.schemaVersion, 2);
    assert.equal(create.body.sketch.layers.drawingVersion, 2);

    const list = await request(app)
      .get(`/api/survey/v1/projects/${projectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.sketches.length, 1);

    const get = await request(app)
      .get(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.sketch.title, "1F配線図");
    assert.ok(get.body.sketch.backgroundImage === null || typeof get.body.sketch.backgroundImage === "object");
  });

  it("背景写真と描画レイヤー（配線ルート）を保存できる", async () => {
    const bg = await request(app)
      .post(`/api/survey/v1/drawing-sketches/${sketchId}/background`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageBase64: TINY_PNG, fileName: "grid.png", mimeType: "image/png" });
    assert.equal(bg.status, 200);
    assert.ok(bg.body.sketch.backgroundImageUrl.includes("/uploads/survey/"));
    assert.ok(bg.body.sketch.backgroundImage?.path);

    const layers = {
      schemaVersion: 2,
      drawingVersion: 2,
      canvasWidth: 1,
      canvasHeight: 1,
      paths: [
        {
          id: "p1",
          tool: "route",
          lineType: "lan",
          color: "#2563eb",
          width: 3,
          points: [
            { x: 10, y: 10 },
            { x: 50, y: 50 },
          ],
          lengthPx: 56.57,
        },
      ],
      symbols: [
        {
          id: "sym1",
          symbolType: "dome_camera",
          label: "ドームカメラ",
          icon: "📷",
          color: "#2563eb",
          x: 100,
          y: 120,
          rotation: 45,
          scale: 1,
          memo: "玄関",
        },
      ],
      notes: [{ id: "t1", text: "配線メモ", x: 80, y: 80, fontSize: 14, color: "#0f172a" }],
      viewport: { scale: 1.2, offsetX: 0, offsetY: 0 },
    };

    const patch = await request(app)
      .patch(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ layers });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.sketch.layers.symbols.length, 1);
    assert.equal(patch.body.sketch.layers.paths[0].lineType, "lan");
    assert.ok(patch.body.sketch.layers.paths[0].lengthPx > 0);
  });

  it("AI清書用JSONをエクスポートできる", async () => {
    const res = await request(app)
      .get(`/api/survey/v1/drawing-sketches/${sketchId}/ai-export`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.export.schemaVersion, 2);
    assert.equal(res.body.export.projectId, projectId);
    assert.equal(res.body.export.paths.length, 1);
    assert.equal(res.body.export.symbols.length, 1);
    assert.ok(res.body.export.exportedAt);
    assert.ok(res.body.export.viewport.scale);
  });

  it("survey-drawing-v1 ページを配信できる", async () => {
    const res = await request(app).get("/survey-drawing-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("survey-drawing-v1.js"));
    assert.ok(res.text.includes("btn-ai-export"));
    assert.ok(res.text.includes('rel="apple-touch-icon"'));
  });

  it("図面スケッチを削除できる", async () => {
    const del = await request(app)
      .delete(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 200);
    const get = await request(app)
      .get(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(get.status, 404);
  });
});
