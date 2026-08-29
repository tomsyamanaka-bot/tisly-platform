/**
 * 製造DX・パラメトリック寸法微調整 / ナンバリング UI
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

export interface Parametric3dModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const PARAMETRIC_3D_MODULE_SEED_IDS = [
  "kn-seed-3d-param-delta-001",
  "kn-seed-3d-param-number-001",
] as const;

export const PARAMETRIC_3D_CARD_IDS = [
  "FACTORY-3D-PARAM-DELTA-001",
  "FACTORY-3D-PARAM-NUMBER-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T15:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type Parametric3dSeedDef = {
  moduleId: (typeof PARAMETRIC_3D_MODULE_SEED_IDS)[number];
  cardId: (typeof PARAMETRIC_3D_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DELTA_BODY = [
  "【入力チャネル】",
  "PWA 上のスライダー／数値入力、音声・テキストの",
  "差分指示、赤ペン再撮影の 3 経路で寸法を更新する。",
  "白ベース×navy で屋外でもワンタップ操作できる。",
  "",
  "【再計算】",
  "方眼紙 AI・スキャン由来の 3D に対し、穴ピッチ・",
  "板厚・外形を数秒でパラメトリック再計算する。",
  "差分のみをモデルへ適用しフル再生成を避ける。",
  "",
  "【現場効果】",
  "現物合わせの微調整を爆速化し、事務所往復や",
  "再スキャン待ちを削減する。",
].join("\n");

const NUMBER_BODY = [
  "【丸数字バッジ】",
  "幅／高さ／穴径／ピッチ／肉厚など変更可能箇所に",
  "①②③… の丸数字を自動付与する。3D と手書き図面",
  "の両方で同一インデックスを共有する。",
  "",
  "【番号指定操作】",
  "スライダー・音声指示・チャット修正を「②を 0.5mm」",
  "のように番号指定で直感操作する。認識齟齬をゼロに近づける。",
  "",
  "【UI/UX】",
  "現場スマホでも迷わない大きくタップしやすいバッジと",
  "連動パネルで、高速パラメトリック調整を実現する。",
].join("\n");

const DEFS: Parametric3dSeedDef[] = [
  {
    moduleId: "kn-seed-3d-param-delta-001",
    cardId: "FACTORY-3D-PARAM-DELTA-001",
    title:
      "【製造DX】現場リアルタイム寸法微調整・パラメトリック差分更新アーキテクチャ",
    tags: [
      "#3Dプリンター",
      "#パラメトリック設計",
      "#現場DX",
      "#寸法調整",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "方眼紙AIやスキャンで生成した3Dデータに対し、",
      "PWA上のスライダー数値入力・音声/テキスト差分指示・赤ペン再撮影により",
      "数秒で寸法・穴ピッチ・板厚を再計算。現場での現物合わせ微調整を爆速化する仕組み。",
    ].join("\n"),
    body: DELTA_BODY,
  },
  {
    moduleId: "kn-seed-3d-param-number-001",
    cardId: "FACTORY-3D-PARAM-NUMBER-001",
    title:
      "【製造DX】3Dパラメトリック寸法ナンバリング・インデックス連動UI設計",
    tags: [
      "#3Dプリンター",
      "#UI設計",
      "#現場DX",
      "#ナンバリング",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "3Dモデルおよび手書き図面の変更可能箇所（幅/高さ/穴径/ピッチ/肉厚）に",
      "「①, ②, ③...」の丸数字バッジを自動付与。",
      "画面上のスライダー・音声指示・チャット修正を番号指定で直感操作可能にし、現場間の認識齟齬をゼロにする高速UI/UX。",
    ].join("\n"),
    body: NUMBER_BODY,
  },
];

export function getParametric3dModuleSeedItemsV1(): Parametric3dModuleSeedItemV1[] {
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

export function getParametric3dCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedParametric3dKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getParametric3dCardSeedInputsV1()) {
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
  const missingInIndex = PARAMETRIC_3D_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
