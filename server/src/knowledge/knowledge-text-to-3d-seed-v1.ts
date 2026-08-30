/**
 * 製造DX・自然言語/音声 Text-to-3D
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

export interface TextTo3dModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const TEXT_TO_3D_MODULE_SEED_IDS = [
  "kn-seed-factory-text-to-3d-001",
] as const;

export const TEXT_TO_3D_CARD_IDS = [
  "FACTORY-TEXT-TO-3D-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T09:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof TEXT_TO_3D_MODULE_SEED_IDS)[number];
  cardId: (typeof TEXT_TO_3D_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【入力】",
  "現場スマホの PWA から、テキストまたは Web Speech API",
  "音声で寸法・形状を指示する。",
  "",
  "【AI 変換】",
  "Gemini（またはルールパーサ）が基本形状・①〜⑥寸法・",
  "特殊加工（単管R／インサート／パッキン溝／角R）を JSON 抽出。",
  "",
  "【連動】",
  "パラメトリックスライダーを自動更新し、Three.js プレビューを",
  "即再描画。ワンタップ STL と印刷ビューワーへ直結する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-factory-text-to-3d-001",
    cardId: "FACTORY-TEXT-TO-3D-001",
    title:
      "【製造DX】自然言語・音声プロンプトからの即時3Dモデリング＆STLオンデマンド生成",
    tags: [
      "#3Dプリンター",
      "#TextTo3D",
      "#音声入力",
      "#現場DX",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "現場から音声やテキストで寸法・形状を指示するだけで、",
      "AIがパラメータとCSGコードを抽出してThree.jsプレビューを",
      "リアルタイム更新。CADスキル不要でオンデマンド3Dプリントを完結。",
    ].join("\n"),
    body: BODY,
  },
];

export function getTextTo3dModuleSeedItemsV1(): TextTo3dModuleSeedItemV1[] {
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

export function getTextTo3dCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedTextTo3dKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getTextTo3dCardSeedInputsV1()) {
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
  const missingInIndex = TEXT_TO_3D_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
