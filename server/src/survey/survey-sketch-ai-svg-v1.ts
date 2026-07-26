/**
 * 現調スケッチ壁輪郭 SVG v1
 * — Vision（Gemini）呼び出しの公開エントリ
 *
 * 本番経路: 画像 → Gemini → サニタイズ SVG（aiWallSvg）
 * キー未設定時: mock プロバイダ（固定ダミー SVG）
 */
import fs from "fs";
import path from "path";
import { GeminiSurveySketchAiSvgProviderV1 } from "./survey-sketch-ai-svg-gemini-provider.js";
import {
  buildMockAiWallSvgV1,
  mockSurveySketchAiSvgProviderV1,
} from "./survey-sketch-ai-svg-mock-provider.js";
import {
  SURVEY_SKETCH_AI_SVG_SCHEMA,
  type SurveySketchAiSvgImageInputV1,
  type SurveySketchAiSvgProviderId,
  type SurveySketchAiSvgProviderMode,
  type SurveySketchAiSvgProviderV1,
  type SurveySketchAiSvgResultV1,
} from "./survey-sketch-ai-svg-types.js";

export { SURVEY_SKETCH_AI_SVG_SCHEMA };
export type {
  SurveySketchAiSvgImageInputV1,
  SurveySketchAiSvgProviderId,
  SurveySketchAiSvgProviderMode,
  SurveySketchAiSvgResultV1,
};
export { sanitizeAiWallSvgResponseV1 } from "./survey-sketch-ai-svg-sanitize.js";
export {
  MOCK_AI_WALL_SVG_V1,
  buildMockAiWallSvgV1,
} from "./survey-sketch-ai-svg-mock-provider.js";
export { SURVEY_SKETCH_AI_SVG_PROMPT_V1 } from "./survey-sketch-ai-svg-gemini-provider.js";

function envTrim(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

/**
 * GEMINI_API_KEY を環境変数から取得
 */
export function getGeminiApiKeyV1(): string {
  return envTrim("GEMINI_API_KEY");
}

/**
 * プロバイダモード
 * SURVEY_SKETCH_AI_SVG_PROVIDER=auto|mock|gemini
 */
export function getSurveySketchAiSvgProviderModeV1(): SurveySketchAiSvgProviderMode {
  const raw = envTrim(
    "SURVEY_SKETCH_AI_SVG_PROVIDER",
    "auto"
  ).toLowerCase();
  if (raw === "mock" || raw === "gemini") return raw;
  return "auto";
}

/**
 * 実プロバイダを解決
 * auto: キー有り → gemini / 無し → mock
 */
export function resolveSurveySketchAiSvgProviderV1(): {
  provider: SurveySketchAiSvgProviderV1;
  resolvedId: SurveySketchAiSvgProviderId;
  reason: string | null;
} {
  const mode = getSurveySketchAiSvgProviderModeV1();
  const apiKey = getGeminiApiKeyV1();

  if (mode === "mock") {
    return {
      provider: mockSurveySketchAiSvgProviderV1,
      resolvedId: "mock",
      reason: "forced_mock",
    };
  }

  if (mode === "gemini") {
    if (!apiKey) {
      return {
        provider: mockSurveySketchAiSvgProviderV1,
        resolvedId: "mock",
        reason: "gemini_key_missing",
      };
    }
    return {
      provider: new GeminiSurveySketchAiSvgProviderV1({
        apiKey,
        model: envTrim(
          "GEMINI_SKETCH_MODEL",
          "gemini-3.6-flash"
        ),
      }),
      resolvedId: "gemini",
      reason: null,
    };
  }

  // auto
  if (!apiKey) {
    return {
      provider: mockSurveySketchAiSvgProviderV1,
      resolvedId: "mock",
      reason: "api_key_unset",
    };
  }

  return {
    provider: new GeminiSurveySketchAiSvgProviderV1({
      apiKey,
      model: envTrim(
        "GEMINI_SKETCH_MODEL",
        "gemini-3.6-flash"
      ),
    }),
    resolvedId: "gemini",
    reason: null,
  };
}

function surveyImageFullPath(imagePath: string): string {
  const base =
    process.env.TISLY_UPLOADS_DIR ||
    path.join(process.cwd(), "uploads");
  return path.join(base, "survey", imagePath);
}

/**
 * バッファから壁輪郭 SVG を抽出
 */
export async function extractAiWallSvgFromBufferV1(
  input: SurveySketchAiSvgImageInputV1
): Promise<SurveySketchAiSvgResultV1> {
  const canvasW = input.canvasWidth ?? 800;
  const canvasH = input.canvasHeight ?? 600;

  if (!input.buffer?.length || input.buffer.length < 32) {
    return {
      schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
      ok: true,
      aiWallSvg: buildMockAiWallSvgV1(canvasW, canvasH),
      provider: "mock",
      usedMock: true,
      reason: "empty_blob",
      fileName: input.fileName ?? null,
    };
  }

  const { provider, reason: resolveReason } =
    resolveSurveySketchAiSvgProviderV1();

  try {
    const result = await provider.extractWallSvg(input);
    if (resolveReason && result.usedMock) {
      return { ...result, reason: resolveReason };
    }
    if (resolveReason && !result.reason) {
      return { ...result, reason: resolveReason };
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[survey-sketch-ai-svg] provider failed", msg);
    // API 障害時もフロント検証を止めない（生ログは reason に載せない）
    return {
      schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
      ok: true,
      aiWallSvg: buildMockAiWallSvgV1(canvasW, canvasH),
      provider: "mock",
      usedMock: true,
      reason: "provider_error",
      fileName: input.fileName ?? null,
    };
  }
}

/**
 * Base64（data URL 可）から抽出
 */
export async function extractAiWallSvgFromBase64V1(input: {
  imageBase64: string;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
}): Promise<SurveySketchAiSvgResultV1> {
  const raw = String(input.imageBase64 ?? "");
  const comma = raw.indexOf(",");
  const b64 =
    raw.startsWith("data:") && comma >= 0
      ? raw.slice(comma + 1)
      : raw;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    buffer = Buffer.alloc(0);
  }
  return extractAiWallSvgFromBufferV1({
    buffer,
    fileName: input.fileName,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
  });
}

/**
 * 保存済み背景パスから抽出
 */
export async function extractAiWallSvgFromImagePathV1(input: {
  imagePath: string | null;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
}): Promise<SurveySketchAiSvgResultV1> {
  const canvasW = input.canvasWidth ?? 800;
  const canvasH = input.canvasHeight ?? 600;
  const fileName = input.fileName ?? null;

  if (!input.imagePath) {
    return {
      schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
      ok: true,
      aiWallSvg: buildMockAiWallSvgV1(canvasW, canvasH),
      provider: "mock",
      usedMock: true,
      reason: "sketch_not_found",
      fileName,
    };
  }

  const full = surveyImageFullPath(input.imagePath);
  if (!fs.existsSync(full)) {
    return {
      schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
      ok: true,
      aiWallSvg: buildMockAiWallSvgV1(canvasW, canvasH),
      provider: "mock",
      usedMock: true,
      reason: "image_missing",
      fileName:
        fileName ?? path.basename(input.imagePath),
    };
  }

  const buffer = fs.readFileSync(full);
  return extractAiWallSvgFromBufferV1({
    buffer,
    fileName:
      fileName ?? path.basename(input.imagePath),
    canvasWidth: canvasW,
    canvasHeight: canvasH,
  });
}
