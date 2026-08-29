/**
 * Print Models V1 — upload + list + STL serve + page route
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import os from "os";

process.env.JWT_SECRET = "test-jwt-print-models-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-print-models-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.TISLY_PRINT_MODELS_DIR = path.join(os.tmpdir(), `tisly-print-models-${Date.now()}`);

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  formatPrintTimeLabelV1,
  normalizeSliceMetaV1,
  resetPrintModelsForTestV1,
} = await import("../src/print-models/print-models-store-v1.js");

const app = createApp();

/** Minimal ASCII STL (cube) */
function tinyStlBase64(): string {
  const stl = `solid cube
  facet normal 0 0 1
    outer loop
      vertex 0 0 1
      vertex 1 0 1
      vertex 1 1 1
    endloop
  endfacet
endsolid cube
`;
  return Buffer.from(stl, "utf8").toString("base64");
}

describe("Print Models V1 — helpers", () => {
  it("formats 6666s as 1時間51分", () => {
    assert.equal(formatPrintTimeLabelV1(6666), "1時間51分");
  });

  it("normalizes slice aliases", () => {
    const slice = normalizeSliceMetaV1({
      print_time_seconds: 6666,
      layer_count: 274,
      nozzle_temp_c: 200,
      bed_temp_c: 60,
      layer_height_mm: 0.2,
    });
    assert.equal(slice.printTimeSeconds, 6666);
    assert.equal(slice.printTimeLabel, "1時間51分");
    assert.equal(slice.layerCount, 274);
    assert.equal(slice.nozzleTempC, 200);
  });
});

describe("Print Models V1 — API", () => {
  before(() => {
    resetPrintModelsForTestV1();
  });

  after(async () => {
    await closeDatabase();
    try {
      fs.rmSync(process.env.TISLY_PRINT_MODELS_DIR!, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("serves viewer page at /print-model-viewer and /print-model-viewer-v1", async () => {
    for (const pathUrl of ["/print-model-viewer", "/print-model-viewer-v1"]) {
      const res = await request(app).get(pathUrl);
      assert.equal(res.status, 200, pathUrl);
      assert.match(res.text, /3Dプリント ビューワー/);
      assert.match(res.text, /three\.module\.js/);
      assert.match(res.text, /STLLoader|print-model-viewer-v1\.js/);
      assert.match(res.text, /id="pmv-btn-back"/);
      assert.match(res.text, /id="pmv-btn-float-back"/);
      assert.match(res.text, /戻る/);
    }
  });

  it("viewer back nav assets use navy fallback to 3d-generator", async () => {
    const js = await request(app).get(
      "/print-model-viewer-v1/js/print-model-viewer-v1.js"
    );
    assert.equal(js.status, 200);
    assert.match(js.text, /navigateBack/);
    assert.match(js.text, /BACK_FALLBACK_URL/);
    assert.match(js.text, /\/3d-generator/);
    assert.match(js.text, /history\.back/);
    assert.match(js.text, /pmv-btn-back/);
    assert.match(js.text, /pmv-btn-float-back/);

    const css = await request(app).get(
      "/print-model-viewer-v1/css/print-model-viewer-v1.css"
    );
    assert.equal(css.status, 200);
    assert.match(css.text, /\.pmv-back-btn/);
    assert.match(css.text, /\.pmv-float-back/);
    assert.match(css.text, /--pmv-navy|#1e3a8a/i);
    assert.match(css.text, /min-height:\s*44px/);
  });

  it("uploads STL + slice metadata and lists model", async () => {
    const upload = await request(app)
      .post("/api/print-models/v1/upload")
      .send({
        name: "s5m_pulley_50mm",
        source: "automation",
        slice: {
          printTimeSeconds: 6666,
          layerCount: 274,
          nozzleTempC: 200,
          bedTempC: 60,
          layerHeightMm: 0.2,
          infillPercent: 20,
          nozzleSizeMm: 0.4,
        },
        stlFileName: "s5m_pulley_50mm.stl",
        stlBase64: tinyStlBase64(),
      });
    assert.equal(upload.status, 201);
    assert.equal(upload.body.ok, true);
    assert.ok(upload.body.model?.id);
    assert.equal(upload.body.model.slice.printTimeLabel, "1時間51分");
    assert.match(upload.body.viewerUrl, /\/print-model-viewer\?id=/);

    const list = await request(app).get("/api/print-models/v1/models");
    assert.equal(list.status, 200);
    assert.equal(list.body.count, 1);
    assert.equal(list.body.models[0].name, "s5m_pulley_50mm");

    const id = upload.body.model.id;
    const detail = await request(app).get(`/api/print-models/v1/models/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.model.slice.nozzleTempC, 200);

    const stl = await request(app).get(`/api/print-models/v1/models/${id}/stl`);
    assert.equal(stl.status, 200);
    assert.match(stl.headers["content-type"] || "", /stl|octet|model/i);
    assert.ok(Buffer.isBuffer(stl.body) || typeof stl.text === "string");
  });

  it("rejects upload without stlBase64", async () => {
    const res = await request(app).post("/api/print-models/v1/upload").send({ name: "x" });
    assert.equal(res.status, 400);
  });

  it("enforces upload token when configured", async () => {
    process.env.TISLY_PRINT_UPLOAD_TOKEN = "secret-token-xyz";
    const denied = await request(app)
      .post("/api/print-models/v1/upload")
      .send({ name: "locked", stlBase64: tinyStlBase64() });
    assert.equal(denied.status, 401);

    const ok = await request(app)
      .post("/api/print-models/v1/upload")
      .set("Authorization", "Bearer secret-token-xyz")
      .send({ name: "unlocked", stlBase64: tinyStlBase64() });
    assert.equal(ok.status, 201);
    delete process.env.TISLY_PRINT_UPLOAD_TOKEN;
  });
});
