/**
 * 5分ハートビート死活監視 ＆ 現場クローン
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

export interface HeartbeatCloneModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const HEARTBEAT_CLONE_MODULE_SEED_IDS = [
  "kn-seed-heartbeat-clone-ops-001",
] as const;

export const HEARTBEAT_CLONE_CARD_IDS = [
  "OPS-HEARTBEAT-CLONE-001",
] as const;

const SEED_CREATED_AT = "2026-09-07T07:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-07";

const TITLE =
  "【運用DX】5分ハートビート死活監視標準 ＆ 現場プロファイルクローン展開仕様";

const TAGS = [
  "#死活監視",
  "#ハートビート",
  "#WebPush",
  "#現場クローン",
  "#顧客台帳",
  "#TiSLY_Core",
];

const SUMMARY = [
  "300秒周期ハートビートによる5分超過通信途絶の",
  "自動Web Push警報。既存現場（豊島邸・板橋自宅等）の",
  "設定をベースに、プロンプト指示1行で新規顧客へ",
  "複製・微調整展開する保守DX仕様。",
].join("");

const BODY = [
  "【死活監視標準】",
  "実機 HEARTBEAT_INTERVAL_SEC = 300（5分）。",
  "VPS 途絶判定 = 5分30秒（揺らぎ余裕）。",
  "途絶時ステータス: 🔴 オフライン（通信途絶）。",
  "Push: ⚠️ 【緊急】〇〇邸：主装置との通信が",
  "途絶えました（5分以上ハートビート未受信）。",
  "",
  "【現場クローン】",
  "指示例: 新規顧客［佐藤邸］を［豊島邸］と同じ",
  "機器構成で作成。ただし点灯45秒・DI1玄関…",
  "→ buildCustomerSiteProfileCloneV1 で複製し、",
  "差分のみ上書き・台帳へ append。",
].join("\n");

type Def = {
  moduleId: (typeof HEARTBEAT_CLONE_MODULE_SEED_IDS)[number];
  cardId: (typeof HEARTBEAT_CLONE_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-heartbeat-clone-ops-001",
    cardId: "OPS-HEARTBEAT-CLONE-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getHeartbeatCloneModuleSeedItemsV1(): HeartbeatCloneModuleSeedItemV1[] {
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

export function getHeartbeatCloneCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedHeartbeatCloneKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getHeartbeatCloneCardSeedInputsV1()) {
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
  const missing = HEARTBEAT_CLONE_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
