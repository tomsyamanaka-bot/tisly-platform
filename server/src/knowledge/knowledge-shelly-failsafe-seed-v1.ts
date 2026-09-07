/**
 * Shelly Gen3 フェイルセーフ仕様
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

export interface ShellyFailsafeModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const SHELLY_FAILSAFE_MODULE_SEED_IDS = [
  "kn-seed-shelly-failsafe-cold-reboot-001",
] as const;

export const SHELLY_FAILSAFE_CARD_IDS = [
  "OPS-SHELLY-FAILSAFE-COLD-REBOOT-001",
] as const;

const SEED_CREATED_AT = "2026-09-07T09:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-07";

const TITLE =
  "【保守フェイルセーフ】5分ハートビート死活監視 ＆ Shelly Gen3による10分未受信時コールドリブート標準仕様";

const TAGS = [
  "#死活監視",
  "#ShellyGen3",
  "#コールドリブート",
  "#PoE再起動",
  "#フェイルセーフ",
  "#TiSLY_Core",
];

const SUMMARY = [
  "5分周期ハートビートに対して一時的揺らぎを許容し、",
  "2回連続未受信（10分〜10分30秒経過）でShelly 1 Mini Gen3",
  "リレーをOFF ➔ 5秒後Auto-ONキック。残留電荷を完全放電させて",
  "RP2350を自動復旧。無限再起動防止（リトライ最大2回・30分クールダウン）",
  "のセーフティガード仕様。",
].join("");

const BODY = [
  "【死活監視】",
  "実機 HB 300 秒。VPS 途絶 Push = 5 分 30 秒。",
  "",
  "【Shelly 自動キック】",
  "しきい値 = 10 分 30 秒（2 回未受信 + 揺らぎ）。",
  "動作: Switch OFF → 5 秒 → Auto ON（PoE 再投入）。",
  "ログ: ⚡ 10分未受信検知：ShellyによるPoE電源再投入",
  "（5秒リブート）を実行。",
  "",
  "【セーフティ】",
  "同一途絶期間のリトライ最大 2 回。",
  "クールダウン既定 30 分。",
].join("\n");

type Def = {
  moduleId: (typeof SHELLY_FAILSAFE_MODULE_SEED_IDS)[number];
  cardId: (typeof SHELLY_FAILSAFE_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-shelly-failsafe-cold-reboot-001",
    cardId: "OPS-SHELLY-FAILSAFE-COLD-REBOOT-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getShellyFailsafeModuleSeedItemsV1(): ShellyFailsafeModuleSeedItemV1[] {
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

export function getShellyFailsafeCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedShellyFailsafeKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getShellyFailsafeCardSeedInputsV1()) {
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
  const missing = SHELLY_FAILSAFE_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
