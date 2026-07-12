/**
 * 現調スケッチ壁輪郭 SVG（Vision / Gemini）v1
 * — 型定義のみ
 */

export const SURVEY_SKETCH_AI_SVG_SCHEMA = 1 as const;

/** プロバイダ識別子 */
export type SurveySketchAiSvgProviderId = "mock" | "gemini";

/**
 * プロバイダ選択
 * auto = GEMINI_API_KEY 有無で自動切替
 */
export type SurveySketchAiSvgProviderMode =
  | "auto"
  | SurveySketchAiSvgProviderId;

export interface SurveySketchAiSvgImageInputV1 {
  /** 画像バイナリ */
  buffer: Buffer;
  /** MIME（未指定時は推定） */
  mimeType?: string | null;
  /** 元ファイル名（任意） */
  fileName?: string | null;
  /** キャンバス幅（viewBox ヒント） */
  canvasWidth?: number;
  /** キャンバス高さ（viewBox ヒント） */
  canvasHeight?: number;
}

export interface SurveySketchAiSvgResultV1 {
  schemaVersion: typeof SURVEY_SKETCH_AI_SVG_SCHEMA;
  ok: true;
  /** サニタイズ済み壁輪郭 SVG */
  aiWallSvg: string;
  /** 実際に使ったプロバイダ */
  provider: SurveySketchAiSvgProviderId;
  /** mock かどうか */
  usedMock: boolean;
  /** 補足理由（キー未設定など） */
  reason: string | null;
  fileName: string | null;
  /** Gemini 生テキスト長（デバッグ用） */
  rawTextLength?: number;
}

/**
 * Vision プロバイダ共通インターフェース
 */
export interface SurveySketchAiSvgProviderV1 {
  readonly providerId: SurveySketchAiSvgProviderId;
  extractWallSvg(
    input: SurveySketchAiSvgImageInputV1
  ): Promise<SurveySketchAiSvgResultV1>;
}
