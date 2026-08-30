/**
 * 天面接地オートオリエンテーション・ナレッジ
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

export interface TopDownOrientModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const TOP_DOWN_ORIENT_MODULE_SEED_IDS = [
  "kn-seed-top-down-orient-stl-001",
] as const;

export const TOP_DOWN_ORIENT_CARD_IDS = [
  "FACTORY-TOP-DOWN-ORIENT-STL-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T18:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof TOP_DOWN_ORIENT_MODULE_SEED_IDS)[number];
  cardId: (typeof TOP_DOWN_ORIENT_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【天面接地】",
  "薄肉ボックス・端子カバーは天板をビルドプレート側",
  "（Z=0）へ向けて180度反転エクスポートする。",
  "",
  "【サポートレス】",
  "内部中空のサポート材をゼロ化し、材料コストと",
  "印刷時間を削減する。ボス・リブの積層強度も向上。",
  "",
  "【PWA操作】",
  "底板削除後に「天面接地」トグルでプレビュー確認し、",
  "ワンタップ STL 出力する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-top-down-orient-stl-001",
    cardId: "FACTORY-TOP-DOWN-ORIENT-STL-001",
    title:
      "【製造DX】筐体カバーの天面接地オートオリエンテーション＆サポートレスSTL出力",
    tags: [
      "#3Dプリンター",
      "#サポートレス",
      "#STL最適化",
      "#造形強度",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "薄肉ボックスや端子カバーの3Dプリント時、天板を下向き（Z=0接地）に自動反転させてエクスポート。",
      "内部中空部のサポート材をゼロ化し、材料コスト削減・印刷時間短縮・ボス強度向上を両立。",
    ].join("\n"),
    body: BODY,
  },
];

export function getTopDownOrientModuleSeedItemsV1(): TopDownOrientModuleSeedItemV1[] {
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

export function getTopDownOrientCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedTopDownOrientKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getTopDownOrientCardSeedInputsV1()) {
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
  const missingInIndex = TOP_DOWN_ORIENT_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
