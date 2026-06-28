import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-material-mapper-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-material-mapper-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  aggregateDrawingSymbolCountsV1,
  mapDrawingToMaterialsV1,
  buildDrawingContentHashV1,
} = await import("../src/shared/utils/material-mapper-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("material-mapper-v1", () => {
  it("コンセント2・照明1 から必要部材を算出", () => {
    const result = mapDrawingToMaterialsV1({
      symbols: [
        { symbolType: "outlet", label: "コンセント" },
        { symbolType: "outlet", label: "コンセント" },
        { symbolType: "light", label: "照明" },
      ],
    });
    assert.equal(result.schemaVersion, "material-mapper-v1");
    assert.equal(result.totalSymbols, 3);
    const outlet = result.lines.find((l) => l.syncKey === "symbol:outlet:receptacle");
    assert.ok(outlet);
    assert.equal(outlet.quantity, 2);
    const vvf = result.lines.find((l) => l.syncKey === "symbol:outlet:vvf");
    assert.ok(vvf);
    assert.equal(vvf.quantity, 10);
    const lightFixture = result.lines.find((l) => l.syncKey === "symbol:light:fixture");
    assert.ok(lightFixture);
    assert.equal(lightFixture.quantity, 1);
  });

  it("LAN配線パスからケーブル長を算出", () => {
    const result = mapDrawingToMaterialsV1({
      symbols: [],
      paths: [{ lineType: "lan", lengthPx: 500 }],
      mmPerPx: 2,
    });
    const lan = result.lines.find((l) => l.syncKey === "line:lan:lan-cable");
    assert.ok(lan);
    assert.ok(lan.quantity >= 1);
    assert.equal(lan.unit, "m");
  });

  it("記号集計と contentHash が安定", () => {
    const symbols = [
      { symbolType: "outlet" },
      { symbolType: "outlet" },
      { symbolType: "dome_camera" },
    ];
    const counts = aggregateDrawingSymbolCountsV1(symbols);
    assert.equal(counts.find((c) => c.symbolType === "outlet")?.count, 2);
    const h1 = buildDrawingContentHashV1({ symbols });
    const h2 = buildDrawingContentHashV1({ symbols });
    assert.equal(h1, h2);
  });
});

describe("field-check drawing sync v1 API", () => {
  let token = "";
  let surveyProjectId = "";
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

    const created = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "材料同期テスト",
        siteName: "図面材料連携テスト",
        address: "茨城県守谷市",
      });
    assert.equal(created.status, 201);
    surveyProjectId = created.body.projectId;

    const sketchRes = await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "材料連携図面" });
    assert.equal(sketchRes.status, 201);
    sketchId = sketchRes.body.sketch.id;

    const patch = await request(app)
      .patch(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        layers: {
          schemaVersion: 2,
          drawingVersion: 2,
          canvasWidth: 800,
          canvasHeight: 600,
          symbols: [
            {
              id: "s1",
              symbolType: "outlet",
              label: "コンセント",
              icon: "🔌",
              color: "#ca8a04",
              x: 0.3,
              y: 0.4,
              rotation: 0,
              scale: 1,
              memo: "",
            },
            {
              id: "s2",
              symbolType: "dome_camera",
              label: "ドームカメラ",
              icon: "📷",
              color: "#2563eb",
              x: 0.6,
              y: 0.5,
              rotation: 0,
              scale: 1,
              memo: "",
            },
          ],
          paths: [{ id: "p1", lineType: "lan", color: "#2563eb", width: 3, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], lengthPx: 200 }],
          notes: [],
          viewport: { scale: 1, offsetX: 0, offsetY: 0 },
        },
      });
    assert.equal(patch.status, 200);
  });

  after(() => closeDatabase());

  it("POST sync-from-drawing で材料が自動生成される", async () => {
    const res = await request(app)
      .post("/api/field-check/v1/items/sync-from-drawing")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectSource: "survey", projectId: surveyProjectId });
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length >= 4);
    assert.equal(res.body.inserted + res.body.updated, res.body.items.length);
    const auto = res.body.items.filter((i: { source: string }) => i.source === "auto");
    assert.ok(auto.length >= 4);
    assert.ok(auto.some((i: { syncKey?: string }) => i.syncKey?.includes("outlet")));
  });

  it("GET items?withDrawing=1 で図面連動メタを返す", async () => {
    const res = await request(app)
      .get(
        `/api/field-check/v1/items?source=survey&projectId=${surveyProjectId}&withDrawing=1`
      )
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.drawingSync);
    assert.equal(res.body.drawingSync.needsResync, false);
    assert.ok(res.body.items.length >= 4);
  });

  it("図面 PATCH で材料が自動再同期される", async () => {
    await request(app)
      .patch(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        layers: {
          schemaVersion: 2,
          drawingVersion: 2,
          canvasWidth: 800,
          canvasHeight: 600,
          symbols: [
            {
              id: "s3",
              symbolType: "light",
              label: "照明",
              icon: "💡",
              color: "#eab308",
              x: 0.5,
              y: 0.5,
              rotation: 0,
              scale: 1,
              memo: "",
            },
          ],
          paths: [],
          notes: [],
          viewport: { scale: 1, offsetX: 0, offsetY: 0 },
        },
      });

    const status = await request(app)
      .get(
        `/api/field-check/v1/drawing-sync/status?source=survey&projectId=${surveyProjectId}`
      )
      .set("Authorization", `Bearer ${token}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.needsResync, false);
    assert.ok(status.body.items.some((i: { label: string }) => i.label.includes("照明")));
  });
});
