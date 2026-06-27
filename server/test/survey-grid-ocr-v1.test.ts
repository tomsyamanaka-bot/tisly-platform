import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {
  aggregateSymbolCountsV2,
  postSymbolCountsToAiEstimateEngineV2,
} from "../src/master/ai-estimate-engine-v2.js";
import {
  mapGridOcrToDrawingAutoPlotV1,
  runSurveyGridOcrV1,
} from "../src/survey/survey-grid-ocr-v1.js";
import { toSurveyAiPipelineUserError, SurveyAiPipelineError } from "../src/survey/survey-ai-pipeline-v1.js";

process.env.JWT_SECRET = "test-jwt-survey-grid-ocr";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-survey-grid-ocr.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { getDatabase, closeDatabase } = await import("../src/db/database.js");

describe("survey-grid-ocr-v1", () => {
  it("runSurveyGridOcrV1 — testHints で余白メモと記号を返す", async () => {
    const ocr = await runSurveyGridOcrV1({
      testHints: {
        marginTexts: ["エアコン位置", "分電盤"],
        symbols: [
          { symbolType: "outlet", x: 0.3, y: 0.4 },
          { symbolType: "light", x: 0.6, y: 0.5 },
        ],
      },
    });
    assert.equal(ocr.schemaVersion, 1);
    assert.equal(ocr.marginMemos.length, 2);
    assert.equal(ocr.detectedSymbols.length, 2);
    assert.equal(ocr.detectedSymbols[0].autoPlot, true);
  });

  it("mapGridOcrToDrawingAutoPlotV1 — ピクセル座標へ変換", async () => {
    const ocr = await runSurveyGridOcrV1({
      testHints: {
        marginTexts: ["照明"],
        symbols: [{ symbolType: "outlet", x: 0.5, y: 0.5 }],
      },
    });
    const plot = mapGridOcrToDrawingAutoPlotV1(ocr, 800, 600);
    assert.equal(plot.symbols.length, 1);
    assert.equal(plot.symbols[0].x, 400);
    assert.equal(plot.symbols[0].y, 300);
    assert.equal(plot.notes.length, 1);
  });

  it("ファイル名キーワードから余白メモを抽出", async () => {
    const ocr = await runSurveyGridOcrV1({
      fileName: "現調_分電盤_コンセント.jpg",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.ok(ocr.marginMemos.length >= 1);
    assert.match(ocr.rawText, /分電盤|コンセント/);
  });
});

describe("ai-estimate-engine-v2 symbol count handoff", () => {
  before(() => {
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
  });

  after(() => closeDatabase());

  it("aggregateSymbolCountsV2 — 種別別集計", () => {
    const counts = aggregateSymbolCountsV2([
      { symbolType: "outlet", label: "コンセント" },
      { symbolType: "outlet", label: "コンセント" },
      { symbolType: "light", label: "照明" },
    ]);
    assert.equal(counts.find((c) => c.symbolType === "outlet")?.count, 2);
    assert.equal(counts.find((c) => c.symbolType === "light")?.count, 1);
  });

  it("postSymbolCountsToAiEstimateEngineV2 — モック記号から見積候補", () => {
    const result = postSymbolCountsToAiEstimateEngineV2({
      projectId: "test-proj",
      sketchId: "test-sketch",
      symbols: [
        { symbolType: "outlet", label: "コンセント", id: "a" },
        { symbolType: "outlet", label: "コンセント", id: "b" },
        { symbolType: "light", label: "照明", id: "c" },
      ],
    });
    assert.equal(result.totalSymbols, 3);
    assert.equal(result.symbolCounts.length, 2);
    assert.ok(result.estimatePreview);
    assert.ok(result.estimatePreview!.symbolCount >= 3);
  });
});

describe("survey-ai-pipeline-v1 async safe", () => {
  it("toSurveyAiPipelineUserError — SKETCH_NOT_FOUND", () => {
    const mapped = toSurveyAiPipelineUserError(
      new SurveyAiPipelineError(
        "SKETCH_NOT_FOUND",
        "図面データが見つかりません。保存後にもう一度お試しください。",
        "not found"
      )
    );
    assert.equal(mapped.code, "SKETCH_NOT_FOUND");
  });
});
