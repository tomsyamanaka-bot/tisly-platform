/**
 * RP2350-POE 専用カバー＆スキャン結合ナレッジ
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

export interface Rp2350CoverModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const RP2350_COVER_MODULE_SEED_IDS = [
  "kn-seed-rp2350-poe-cover-scan-001",
] as const;

export const RP2350_COVER_CARD_IDS = [
  "FACTORY-RP2350-POE-COVER-SCAN-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T09:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof RP2350_COVER_MODULE_SEED_IDS)[number];
  cardId: (typeof RP2350_COVER_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const COVER_BODY = [
  "【実測テンプレート】",
  "Waveshare RP2350-POE 実測値をプリセット化。",
  "全長 154.2mm · 全幅（フランジ耳）88.1mm ·",
  "内寸幅 69.5mm · 深さ 15.5mm · ボス高 11.4mm。",
  "",
  "【端子逃げ】",
  "CH1〜CH8 / DI1〜DI8 / RS485 / PoE-LAN の",
  "配線逃げスリットと開口ガイドを自動生成する。",
  "",
  "【スキャン結合】",
  "Revopoint MINI 2 の STL/OBJ を半透明オーバーレイ。",
  "ネジ穴ピッチ・端子開口の干渉をブラウザで確認し、",
  "クリアランス +0.2〜+1.0mm 調整後に STL 出力する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-rp2350-poe-cover-scan-001",
    cardId: "FACTORY-RP2350-POE-COVER-SCAN-001",
    title:
      "【製造DX】RP2350-POE実測寸法ベースの3Dプリント専用カバー＆スキャン結合モデリング",
    tags: [
      "#RP2350",
      "#3Dプリンター",
      "#Revopoint",
      "#実測モデリング",
      "#現場DX",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "Waveshare RP2350ボードの実測値（154.2×88.1×15.5mm、内寸69.5mm）をテンプレート化。",
      "Revopoint MINI 2のスキャンデータと重ね合わせて配線逃げ・端子開口・DINマウント付き",
      "カスタムカバーを即座にSTL出力。",
    ].join("\n"),
    body: COVER_BODY,
  },
];

export function getRp2350CoverModuleSeedItemsV1(): Rp2350CoverModuleSeedItemV1[] {
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

export function getRp2350CoverCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedRp2350CoverKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRp2350CoverCardSeedInputsV1()) {
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
  const missingInIndex = RP2350_COVER_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
