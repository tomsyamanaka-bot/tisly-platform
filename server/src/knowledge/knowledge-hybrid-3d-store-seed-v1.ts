/**
 * 製造DX・PWA 3D ハイブリッド保存設計
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

export interface Hybrid3dStoreModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const HYBRID_3D_STORE_MODULE_SEED_IDS = [
  "kn-seed-3d-hybrid-store-001",
] as const;

export const HYBRID_3D_STORE_CARD_IDS = [
  "FACTORY-3D-HYBRID-STORE-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T14:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type Hybrid3dStoreSeedDef = {
  moduleId: (typeof HYBRID_3D_STORE_MODULE_SEED_IDS)[number];
  cardId: (typeof HYBRID_3D_STORE_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const HYBRID_BODY = [
  "【一元プレビュー】",
  "方眼紙 AI 生成・Revopoint スキャン・パラメトリック",
  "調整の 3D データを PWA（Three.js）で同一ビューアー",
  "に載せる。白ベース×navy で現場でも寸法確認できる。",
  "",
  "【3 層保存】",
  "1) IndexedDB — 端末内キャッシュ・オフライン編集",
  "2) ConoHa VPS — Web メタ（案件 ID・版・サムネ）共有",
  "3) 社内 QNAP NAS — 大容量点群・マスター STL 保管",
  "",
  "【運用効果】",
  "回線とストレージコストを抑えつつ、現場は高速プレビュー、",
  "事務所はマスター資産を NAS で保全するハイブリッド運用。",
].join("\n");

const DEFS: Hybrid3dStoreSeedDef[] = [
  {
    moduleId: "kn-seed-3d-hybrid-store-001",
    cardId: "FACTORY-3D-HYBRID-STORE-001",
    title:
      "【製造DX】PWA 3Dモジュール運用フローとQNAP/IndexedDBハイブリッド保存設計",
    tags: [
      "#3Dプリンター",
      "#QNAP",
      "#IndexedDB",
      "#ThreeJS",
      "#データ保存",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "方眼紙AI生成・Revopointスキャン・パラメトリック調整の3DデータをPWA（Three.js）で一元プレビュー。",
      "端末内IndexedDB（オフライン対応）、ConoHa VPS（Webメタ共有）、",
      "社内QNAP NAS（大容量点群・マスターSTL保管）の3層保存で低コスト・超高速運用を実現。",
    ].join("\n"),
    body: HYBRID_BODY,
  },
];

export function getHybrid3dStoreModuleSeedItemsV1(): Hybrid3dStoreModuleSeedItemV1[] {
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

export function getHybrid3dStoreCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedHybrid3dStoreKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getHybrid3dStoreCardSeedInputsV1()) {
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
  const missingInIndex = HYBRID_3D_STORE_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
