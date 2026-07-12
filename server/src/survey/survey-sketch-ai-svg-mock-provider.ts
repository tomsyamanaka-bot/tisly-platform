/**
 * 壁輪郭 SVG のモックプロバイダ
 * API キー未設定・開発時に固定ダミー SVG を返す
 */
import {
  SURVEY_SKETCH_AI_SVG_SCHEMA,
  type SurveySketchAiSvgImageInputV1,
  type SurveySketchAiSvgProviderV1,
  type SurveySketchAiSvgResultV1,
} from "./survey-sketch-ai-svg-types.js";

/**
 * 方眼・影なしのクリーンな間取り外枠＋内壁
 * （フロント検証用の固定ダミー）
 */
export const MOCK_AI_WALL_SVG_V1 = [
  '<svg xmlns="http://www.w3.org/2000/svg"',
  ' viewBox="0 0 800 600" width="800" height="600"',
  ' fill="none" stroke="#0f172a" stroke-width="3"',
  ' stroke-linecap="round" stroke-linejoin="round">',
  // 外周壁
  '<path d="M80 60 H720 V540 H80 Z"/>',
  // 中央縦壁
  '<path d="M400 60 V300"/>',
  // 左室横壁
  '<path d="M80 300 H400"/>',
  "</svg>",
].join("");

/**
 * キャンバスサイズに合わせて viewBox を調整したダミー
 */
export function buildMockAiWallSvgV1(
  canvasWidth = 800,
  canvasHeight = 600
): string {
  const w = Math.max(100, Math.round(canvasWidth));
  const h = Math.max(100, Math.round(canvasHeight));
  const mX = Math.round(w * 0.1);
  const mY = Math.round(h * 0.1);
  const midX = Math.round(w / 2);
  const midY = Math.round(h / 2);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"`,
    ' fill="none" stroke="#0f172a" stroke-width="3"',
    ' stroke-linecap="round" stroke-linejoin="round">',
    `<path d="M${mX} ${mY} H${w - mX} V${h - mY} H${mX} Z"/>`,
    `<path d="M${midX} ${mY} V${midY}"/>`,
    `<path d="M${mX} ${midY} H${midX}"/>`,
    "</svg>",
  ].join("");
}

export class MockSurveySketchAiSvgProviderV1
  implements SurveySketchAiSvgProviderV1
{
  readonly providerId = "mock" as const;

  async extractWallSvg(
    input: SurveySketchAiSvgImageInputV1
  ): Promise<SurveySketchAiSvgResultV1> {
    const w = input.canvasWidth ?? 800;
    const h = input.canvasHeight ?? 600;
    const aiWallSvg = buildMockAiWallSvgV1(w, h);

    return {
      schemaVersion: SURVEY_SKETCH_AI_SVG_SCHEMA,
      ok: true,
      aiWallSvg,
      provider: "mock",
      usedMock: true,
      reason: "mock_provider",
      fileName: input.fileName ?? null,
      rawTextLength: aiWallSvg.length,
    };
  }
}

export const mockSurveySketchAiSvgProviderV1 =
  new MockSurveySketchAiSvgProviderV1();
