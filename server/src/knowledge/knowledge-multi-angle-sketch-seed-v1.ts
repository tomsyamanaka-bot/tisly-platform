/**
 * 製造DX・マルチアングル方眼紙 Vision 抽出
 * ナレッジ追記（既存データ保護）
 */

import type {
  KnowledgeCardInputV1,
  KnowledgeCardV1,
} from "./knowledge-types.js";
import {
  getKnowledgeCardV1,
  loadKnowledgeSearchIndexV1,
  rebuildKnowledgeSearchIndexV1,
  saveKnowledgeCardV1,
} from "./knowledge-store-v1.js";

export interface MultiAngleSketchModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const MULTI_ANGLE_SKETCH_MODULE_SEED_IDS = [
  "kn-seed-factory-multi-angle-sketch-001",
] as const;

export const MULTI_ANGLE_SKETCH_CARD_IDS = [
  "FACTORY-MULTI-ANGLE-SKETCH-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T10:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof MULTI_ANGLE_SKETCH_MODULE_SEED_IDS)[number];
  cardId: (typeof MULTI_ANGLE_SKETCH_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【撮影】",
  "正面・側面・上（または斜め）を最大4枚まで PWA に登録。",
  "サムネイル右上の ✕ で差し替え可能。",
  "",
  "【Gemini Vision】",
  "全画像を一括送信し、三面図として幅・奥行・高さ・板厚・",
  "穴径・穴ピッチを相互検証。1枚時のパース歪みを補正する。",
  "",
  "【連動】",
  "抽出結果はパラメトリックスライダーと Three.js プレビューへ",
  "即時反映し、STL オンデマンドへ直結する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-factory-multi-angle-sketch-001",
    cardId: "FACTORY-MULTI-ANGLE-SKETCH-001",
    title:
      "【製造DX】マルチアングル方眼紙スケッチによるGemini Vision高精度3D寸法抽出",
    tags: [
      "#3Dプリンター",
      "#GeminiVision",
      "#三面図認識",
      "#マルチアングル",
      "#現場DX",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "正面・側面・ナナメの複数枚スケッチからAIが立体形状と寸法を相互検証。",
      "1枚撮影時のパース歪みを排除し、ミリ単位のパラメータ抽出精度を劇的に向上。",
    ].join("\n"),
    body: BODY,
  },
];

export function getMultiAngleSketchModuleSeedItemsV1(): MultiAngleSketchModuleSeedItemV1[] {
  return DEFS.map((d) => ({
    id: d.moduleId,
    title: d.title,
    summary: d.summary,
    body: d.body,
    genre: d.genre,
    tags: [...d.tags],
    pdf_url: null,
    createdAt: SEED_CREATED_AT,
  }));
}

export function getMultiAngleSketchCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return DEFS.map((d) => ({
    id: d.cardId,
    title: d.title,
    category: d.category,
    tags: [...d.tags],
    summary: `${d.summary}\n\n${d.body}`,
    body: d.body,
    files: [],
    updatedAt: SEED_UPDATED_AT,
    sourceType: "manual" as const,
    qnapSyncStatus: "pending" as const,
  }));
}

export function seedMultiAngleSketchKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getMultiAngleSketchCardSeedInputsV1()) {
    const existing = getKnowledgeCardV1(input.id!);
    if (
      existing &&
      existing.title === input.title &&
      existing.summary === input.summary &&
      existing.body === input.body &&
      JSON.stringify(existing.tags) === JSON.stringify(input.tags)
    ) {
      continue;
    }
    created.push(saveKnowledgeCardV1(input, { skipQnapQueue: true }));
  }

  const index = loadKnowledgeSearchIndexV1();
  const indexed = new Set(index.entries.map((e) => e.id));
  const missingInIndex = MULTI_ANGLE_SKETCH_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
