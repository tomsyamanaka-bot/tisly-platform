/**
 * マルチテナント初期描画スケルトン
 * ＆ハートビート強制同期ナレッジ
 * （既存保護・末尾追記）
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

export interface PwaTenantSkeletonModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const PWA_TENANT_SKELETON_MODULE_SEED_IDS = [
  "kn-seed-pwa-tenant-skeleton-hb-001",
] as const;

export const PWA_TENANT_SKELETON_CARD_IDS = [
  "OPS-PWA-TENANT-SKELETON-HB-001",
] as const;

const SEED_CREATED_AT = "2026-09-09T08:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-09";

const TITLE =
  "【PWA最適化】マルチテナント初期描画チラつき防止スケルトン ＆ ハートビート強制同期仕様";

const TAGS = [
  "#PWA",
  "#マルチテナント",
  "#初期描画最適化",
  "#死活監視",
  "#TiSLY_Core",
];

const SUMMARY = [
  "顧客用共通URL（/customer）における",
  "非同期テナント解決時のデフォルト仮コンポーネント露出防止処理と、",
  "現場手動更新による最新通信ヘルス即時同期アーキテクチャ。",
].join("");

const BODY = [
  "【初期描画】",
  "テナント認証・顧客プロファイル確定前は",
  "白×navy スケルトンのみ表示。",
  "TiSLY Security 仮間取りは出さない。",
  "豊島邸は「豊島邸の安心ステータスを確認中...」。",
  "",
  "【手動同期】",
  "🔄 最新状態に更新で HB を no-store 再取得。",
  "差分 5 分以内なら即時",
  "🟢 正常稼働中（オンライン）へ再描画。",
  "古い最終確認時刻（例: 17:01）は破棄。",
].join("\n");

type Def = {
  moduleId: (typeof PWA_TENANT_SKELETON_MODULE_SEED_IDS)[number];
  cardId: (typeof PWA_TENANT_SKELETON_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-pwa-tenant-skeleton-hb-001",
    cardId: "OPS-PWA-TENANT-SKELETON-HB-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getPwaTenantSkeletonModuleSeedItemsV1(): PwaTenantSkeletonModuleSeedItemV1[] {
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

export function getPwaTenantSkeletonCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedPwaTenantSkeletonKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getPwaTenantSkeletonCardSeedInputsV1()) {
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
  const missing = PWA_TENANT_SKELETON_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
