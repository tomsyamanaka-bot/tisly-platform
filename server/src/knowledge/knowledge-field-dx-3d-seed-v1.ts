/**
 * 電工DX統合3Dジェネレーター・ナレッジ
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

export interface FieldDx3dModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const FIELD_DX_3D_MODULE_SEED_IDS = [
  "kn-seed-field-dx-3d-unified-001",
] as const;

export const FIELD_DX_3D_CARD_IDS = [
  "FACTORY-FIELD-DX-3D-UNIFIED-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof FIELD_DX_3D_MODULE_SEED_IDS)[number];
  cardId: (typeof FIELD_DX_3D_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【通線ノックアウト】",
  "RJ45 / VVF2.0-3C / PF16 / PG9 / 0.4mm薄肉KO を",
  "ワンタッチ選択し、側面・底面へ開口ガイドを自動配置。",
  "",
  "【DIN・マグネット座】",
  "標準ビス穴・35mm DINレール爪・φ10/φ15",
  "マグネット圧入ポケットを背面に自動付与する。",
  "",
  "【コスト試算】",
  "PLA-CF 使用量（g）・原価・K2 Plus 想定印刷時間を",
  "パラメータ変更と同時にリアルタイム表示する。",
  "",
  "【分解図】",
  "外枠・基板・端子カバー・ネジ/インサートを",
  "Three.js 爆発図スライダーで組み立て確認する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-field-dx-3d-unified-001",
    cardId: "FACTORY-FIELD-DX-3D-UNIFIED-001",
    title:
      "【製造DX】電工パーツ自動抜き穴・DIN固定座・コスト試算・分解図統合3Dジェネレーター",
    tags: [
      "#3Dプリンター",
      "#電工DX",
      "#DINレール",
      "#原価計算",
      "#分解図",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "通線ノックアウト、DINレール爪、マグネットポケットの自動配置から、",
      "樹脂コスト/出力時間の即時試算、Three.js爆発図プレビューまでを統合した",
      "現場特化型オンデマンド製造パイプライン。",
    ].join("\n"),
    body: BODY,
  },
];

export function getFieldDx3dModuleSeedItemsV1(): FieldDx3dModuleSeedItemV1[] {
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

export function getFieldDx3dCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedFieldDx3dKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getFieldDx3dCardSeedInputsV1()) {
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
  const missingInIndex = FIELD_DX_3D_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
