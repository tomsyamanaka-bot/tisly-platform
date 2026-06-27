/**
 * 図面エディタ v1 — PDF 連携用ペイロード型
 * pdf-base-template へ渡す前段の
 * クリーンな JSON 構造を定義
 */

export const DRAWING_EDITOR_PAYLOAD_SCHEMA_VERSION = 1 as const;

/** 現場向け記号種別（業種ごとに拡張予定） */
export const DRAWING_EDITOR_SYMBOL_TYPES = [
  "outlet",
  "light",
  "switch",
] as const;

export type DrawingEditorSymbolTypeV1 =
  (typeof DRAWING_EDITOR_SYMBOL_TYPES)[number];

/** 正規化座標（0〜1）— キャンバスサイズ非依存 */
export interface DrawingEditorPlotPointV1 {
  x: number;
  y: number;
}

/** 通線ルート 1 本（正規化座標） */
export interface DrawingEditorRouteV1 {
  id: string;
  /** 線種 ID（lan / power100v / generic 等） */
  lineType: string;
  color: string;
  width: number;
  /** 正規化座標の折れ点列 */
  points: DrawingEditorPlotPointV1[];
}

/** プロット済み記号 1 件 */
export interface DrawingEditorSymbolPlotV1 {
  id: string;
  symbolType: DrawingEditorSymbolTypeV1;
  /** 表示用絵文字アイコン */
  icon: string;
  /** 日本語ラベル（PDF 凡例用） */
  label: string;
  /** 正規化 X（左=0, 右=1） */
  x: number;
  /** 正規化 Y（上=0, 下=1） */
  y: number;
}

/**
 * 仕様書 PDF 等へ引き渡す
 * 図面エディタ出力 JSON
 */
export interface DrawingEditorPdfPayloadV1 {
  schemaVersion: typeof DRAWING_EDITOR_PAYLOAD_SCHEMA_VERSION;
  /** 背景写真 URL（data URL / サーバー URL） */
  backgroundImageUrl: string;
  /** 描画キャンバス幅 px */
  canvasWidth: number;
  /** 描画キャンバス高さ px */
  canvasHeight: number;
  /** プロット済み記号一覧 */
  symbols: DrawingEditorSymbolPlotV1[];
  /** 通線ルート一覧 */
  routes: DrawingEditorRouteV1[];
  /** 生成日時 ISO8601 */
  exportedAt: string;
}

/** 記号メタ（UI・PDF 凡例用） */
export interface DrawingEditorSymbolMetaV1 {
  symbolType: DrawingEditorSymbolTypeV1;
  icon: string;
  label: string;
}

/** デフォルト記号カタログ v1 */
export const DRAWING_EDITOR_SYMBOL_CATALOG_V1: DrawingEditorSymbolMetaV1[] = [
  { symbolType: "outlet", icon: "🔌", label: "コンセント" },
  { symbolType: "light", icon: "💡", label: "照明" },
  { symbolType: "switch", icon: "🔘", label: "スイッチ" },
];
