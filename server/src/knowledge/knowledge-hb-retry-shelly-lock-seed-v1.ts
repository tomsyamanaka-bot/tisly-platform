/**
 * 実機 HB 例外自己復旧
 * ＆ Shelly 自動再起動 30 分ロック
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

export interface HbRetryShellyLockModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const HB_RETRY_SHELLY_LOCK_MODULE_SEED_IDS = [
  "kn-seed-hb-retry-shelly-lock-001",
] as const;

export const HB_RETRY_SHELLY_LOCK_CARD_IDS = [
  "OPS-HB-RETRY-SHELLY-LOCK-001",
] as const;

const SEED_CREATED_AT = "2026-09-09T09:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-09";

const TITLE =
  "【フェイルセーフ】実機MicroPython通信例外自己復旧 ＆ Shelly自動再起動クールダウンロック仕様";

const TAGS = [
  "#死活監視",
  "#例外処理",
  "#ShellyGen3",
  "#再起動ガード",
  "#TiSLY_Core",
];

const SUMMARY = [
  "ネットワーク瞬断時におけるマイコン側ハートビートループの",
  "非停止例外処理と、サーバー側リブート発火後の30分インターロック",
  "による電源再投入ループ防止アーキテクチャ。",
].join("");

const BODY = [
  "【実機 HB】",
  "5分周期ループを try...except で保護。",
  "HTTP失敗時は 10 秒待機し最大 3 回再試行。",
  "全滅しても次の 5 分まで安全にスリープ。",
  "",
  "【Shelly ロック】",
  "自動キック直後は最低 30 分追加リブート禁止。",
  "MCU 起動中の連続電源再投入を防止する。",
].join("\n");

type Def = {
  moduleId: (typeof HB_RETRY_SHELLY_LOCK_MODULE_SEED_IDS)[number];
  cardId: (typeof HB_RETRY_SHELLY_LOCK_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-hb-retry-shelly-lock-001",
    cardId: "OPS-HB-RETRY-SHELLY-LOCK-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getHbRetryShellyLockModuleSeedItemsV1(): HbRetryShellyLockModuleSeedItemV1[] {
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

export function getHbRetryShellyLockCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedHbRetryShellyLockKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getHbRetryShellyLockCardSeedInputsV1()) {
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
  const missing = HB_RETRY_SHELLY_LOCK_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
