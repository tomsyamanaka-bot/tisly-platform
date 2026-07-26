/**
 * Gemini Vision による壁輪郭 SVG 抽出プロバイダ
 * 方眼・影を無視し、壁の輪郭だけをクリーンな SVG で返す
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { sanitizeAiWallSvgResponseV1 } from "./survey-sketch-ai-svg-sanitize.js";
import {
  SURVEY_SKETCH_AI_SVG_SCHEMA,
  type SurveySketchAiSvgImageInputV1,
  type SurveySketchAiSvgProviderV1,
  type SurveySketchAiSvgResultV1,
} from "./survey-sketch-ai-svg-types.js";
import { buildMockAiWallSvgV1 } from "./survey-sketch-ai-svg-mock-provider.js";

/** 解析用最大辺（トークン・帯域節約） */
const ANALYZE_MAX = 1500;

/** 既定モデル（軽量 Vision）— gemini-2.0-flash は 2026-06 で廃止 */
const DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * 提案どおりの意味理解プロンプト
 * — ノイズ無視・壁輪郭のみ・SVG のみ
 */
export const SURVEY_SKETCH_AI_SVG_PROMPT_V1 = [
  "あなたは建築現調の図面清書アシスタントです。",
  "入力画像は方眼紙上の手書き間取りです。",
  "",
  "【厳守】",
  "・方眼紙のマス目や影、紙の汚れ、写真の歪みなどのノイズを完全に無視せよ。",
  "・部屋の壁の輪郭だけを抽出したクリーンな SVG のみを出力せよ。",
  "・説明文・Markdown・コメントは一切出力しない。",
  "・出力は <svg> から </svg> までの1つの SVG のみ。",
  "・塗りつぶしは使わず、stroke の path / line で壁を表現せよ。",
  "・xmlns を含む有効な SVG とすること。",
  "・記号・文字・寸法線は含めない。",
].join("\n");

/**
 * 送信前に長辺を制限し JPEG 化
 */
async function prepareImageForGeminiV1(
  buffer: Buffer,
  _fileName: string | null | undefined
): Promise<{ data: Buffer; mimeType: string }> {
  const resized = await sharp(buffer)
    .rotate()
    .resize({
      width: ANALYZE_MAX,
      height: ANALYZE_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return {
    data: resized,
    mimeType: "image/jpeg",
  };
}

export interface GeminiSurveySketchAiSvgOptionsV1 {
  apiKey: string;
  model?: string;
}

export class GeminiSurveySketchAiSvgProviderV1
  implements SurveySketchAiSvgProviderV1
{
  readonly providerId = "gemini" as const;
  private readonly apiKey: string;
  private readonly modelName: string;

  constructor(options: GeminiSurveySketchAiSvgOptionsV1) {
    this.apiKey = options.apiKey;
    this.modelName = options.model ?? DEFAULT_MODEL;
  }

  async extractWallSvg(
    input: SurveySketchAiSvgImageInputV1
  ): Promise<SurveySketchAiSvgResultV1> {
    const canvasW = input.canvasWidth ?? 800;
    const canvasH = input.canvasHeight ?? 600;
    const fileName = input.fileName ?? null;

    if (!input.buffer?.length || input.buffer.length < 32) {
      return {
        schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
        ok: true,
        aiWallSvg: buildMockAiWallSvgV1(canvasW, canvasH),
        provider: "gemini",
        usedMock: true,
        reason: "empty_blob",
        fileName,
      };
    }

    const prepared = await prepareImageForGeminiV1(
      input.buffer,
      fileName
    );
    const base64 = prepared.data.toString("base64");

    const sizeHint = [
      `キャンバス目安サイズ: ${canvasW}x${canvasH}。`,
      "viewBox はこのサイズに合わせるとよい。",
    ].join("");

    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: this.modelName,
    });

    const result = await model.generateContent([
      {
        text: `${SURVEY_SKETCH_AI_SVG_PROMPT_V1}\n\n${sizeHint}`,
      },
      {
        inlineData: {
          mimeType: prepared.mimeType,
          data: base64,
        },
      },
    ]);

    const rawText = result.response.text() ?? "";
    const sanitized = sanitizeAiWallSvgResponseV1(rawText);

    if (!sanitized) {
      // サニタイズ失敗時はダミーへフォールバック
      // （フロント検証を止めない）
      return {
        schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
        ok: true,
        aiWallSvg: buildMockAiWallSvgV1(canvasW, canvasH),
        provider: "gemini",
        usedMock: true,
        reason: "sanitize_failed",
        fileName,
        rawTextLength: rawText.length,
      };
    }

    return {
      schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
      ok: true,
      aiWallSvg: sanitized,
      provider: "gemini",
      usedMock: false,
      reason: null,
      fileName,
      rawTextLength: rawText.length,
    };
  }
}
