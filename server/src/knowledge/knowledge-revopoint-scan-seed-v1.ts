/**
 * 製造DX・Revopoint MINI 2 スキャン連携
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

export interface RevopointScanModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const REVOPOINT_SCAN_MODULE_SEED_IDS = [
  "kn-seed-revopoint-mini2-scan-001",
] as const;

export const REVOPOINT_SCAN_CARD_IDS = [
  "REVOPOINT-MINI2-SCAN-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T13:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type RevopointScanSeedDef = {
  moduleId: (typeof REVOPOINT_SCAN_MODULE_SEED_IDS)[number];
  cardId: (typeof REVOPOINT_SCAN_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const REVOPOINT_BODY = [
  "【スキャン取込】",
  "Revopoint MINI 2（最高 0.02mm 精度）で取得した",
  "STL / OBJ / PLY を PWA へアップロードする。",
  "物件・案件カードに紐づけ、テナント単位で保管する。",
  "",
  "【Three.js ビューアー】",
  "ブラウザ上で即時展開し、回転・ピンチ拡大・断面",
  "表示で現場パーツを確認する。白ベース×navy UI で",
  "屋外でも寸法計測・干渉確認をワンタップ操作する。",
  "",
  "【リバース〜造形】",
  "計測結果から補修ブラケット等を再設計し、",
  "オンデマンド 3D プリントへ出力する。設計・施工・",
  "保守を同一 PWA で一元管理する。",
].join("\n");

const DEFS: RevopointScanSeedDef[] = [
  {
    moduleId: "kn-seed-revopoint-mini2-scan-001",
    cardId: "REVOPOINT-MINI2-SCAN-001",
    title:
      "【製造DX】Revopoint MINI 2連携・PWA上での3Dスキャンデータ管理とリバースエンジニアリング",
    tags: [
      "#Revopoint",
      "#3Dスキャナー",
      "#ThreeJS",
      "#リバースエンジニアリング",
      "#現場DX",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "Revopoint MINI 2（最高0.02mm精度）でスキャンしたSTL/OBJ/PLYファイルを",
      "PWAのThree.jsビューアーで即時展開。",
      "現場パーツの3D寸法計測、干渉確認、オンデマンド3Dプリント出力を一元管理。",
    ].join("\n"),
    body: REVOPOINT_BODY,
  },
];

export function getRevopointScanModuleSeedItemsV1(): RevopointScanModuleSeedItemV1[] {
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

export function getRevopointScanCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedRevopointScanKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRevopointScanCardSeedInputsV1()) {
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
  const missingInIndex = REVOPOINT_SCAN_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
