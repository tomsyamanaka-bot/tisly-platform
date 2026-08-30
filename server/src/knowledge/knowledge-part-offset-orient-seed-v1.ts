/**
 * パーツ個別オフセット＋天面接地ナレッジ
 * 既存データ保護のうえ末尾追記
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

export interface PartOffsetOrientModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const PART_OFFSET_ORIENT_MODULE_SEED_IDS = [
  "kn-seed-part-offset-orient-001",
] as const;

export const PART_OFFSET_ORIENT_CARD_IDS = [
  "FACTORY-PART-OFFSET-TOPDOWN-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T19:30:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof PART_OFFSET_ORIENT_MODULE_SEED_IDS)[number];
  cardId: (typeof PART_OFFSET_ORIENT_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【位置オフセット】",
  "固定ボス・端子スリット・リブを左右／前後に",
  "±0.1mm 単位で個別オフセットできる。",
  "",
  "【3D連動】",
  "ビュー上のパーツバッジをタップ／ドラッグし、",
  "現物合わせの微調整をその場で反映する。",
  "",
  "【天面接地】",
  "底板削除＋天面接地 STL でサポートレス印刷と",
  "ボス積層強度を両立する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-part-offset-orient-001",
    cardId: "FACTORY-PART-OFFSET-TOPDOWN-001",
    title:
      "【製造DX】筐体パーツ個別オフセット調整＆天面接地サポートレスSTL出力",
    tags: [
      "#3Dプリンター",
      "#パラメトリック設計",
      "#位置調整",
      "#サポートレス",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "筐体内部の固定柱（ボス）や端子スリットの位置を左右・前後にミリ単位で個別オフセット調整可能に。",
      "天面接地反転出力と組み合わせ、現物合わせの微調整からサポートレス印刷までを完全自動化。",
    ].join("\n"),
    body: BODY,
  },
];

export function getPartOffsetOrientModuleSeedItemsV1(): PartOffsetOrientModuleSeedItemV1[] {
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

export function getPartOffsetOrientCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedPartOffsetOrientKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getPartOffsetOrientCardSeedInputsV1()) {
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
  const missingInIndex = PART_OFFSET_ORIENT_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
