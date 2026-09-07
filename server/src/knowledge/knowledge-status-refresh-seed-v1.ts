/**
 * 手動ステータス更新＆0秒HB復帰
 * ナレッジ（既存保護・末尾追記）
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

export interface StatusRefreshModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const STATUS_REFRESH_MODULE_SEED_IDS = [
  "kn-seed-status-refresh-boot-hb-001",
] as const;

export const STATUS_REFRESH_CARD_IDS = [
  "OPS-STATUS-REFRESH-BOOT-HB-001",
] as const;

const SEED_CREATED_AT = "2026-09-07T08:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-07";

const TITLE =
  "【保守DX】PWA手動ステータス即時更新ボタン ＆ 電源投入時0秒ハートビート即時復帰仕様";

const TAGS = [
  "#死活監視",
  "#手動更新",
  "#ハートビート",
  "#即時復旧",
  "#PWA",
  "#TiSLY_Core",
];

const SUMMARY = [
  "現場施工・電源抜き差し時のダウンタイム解消。",
  "実機起動直後の即時ハートビート発報と、",
  "PWA画面上のワンタップ強制再取得ボタンによる",
  "即時オンライン同期アーキテクチャ。",
].join("");

const BODY = [
  "【PWA 手動更新】",
  "顧客 /customer · 社内 /app に",
  "「🔄 最新状態に更新」を配置。",
  "タップでダッシュボードを no-store 再取得し、",
  "稼働ステータス・遅延・盤内温度・最終確認時刻を更新。",
  "完了トースト: 最新の接続状態を取得しました。",
  "",
  "【実機 0 秒 HB】",
  "main.py / main_toyoshima.py / toyoshima_security.py",
  "は 5 分待機ループ前に boot heartbeat を POST。",
  "USB・LAN 再接続直後にサーバーが即時オンライン復帰。",
].join("\n");

type Def = {
  moduleId: (typeof STATUS_REFRESH_MODULE_SEED_IDS)[number];
  cardId: (typeof STATUS_REFRESH_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-status-refresh-boot-hb-001",
    cardId: "OPS-STATUS-REFRESH-BOOT-HB-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getStatusRefreshModuleSeedItemsV1(): StatusRefreshModuleSeedItemV1[] {
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

export function getStatusRefreshCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedStatusRefreshKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getStatusRefreshCardSeedInputsV1()) {
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
  const missing = STATUS_REFRESH_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
