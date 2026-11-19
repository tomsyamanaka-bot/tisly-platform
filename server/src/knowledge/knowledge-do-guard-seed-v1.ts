/**
 * 実機フェイルセーフを末尾追記する。
 * 既存カードは消さない。
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

export const DO_GUARD_MODULE_SEED_IDS = [
  "kn-seed-do-guard-uptime-001",
] as const;

export const DO_GUARD_CARD_IDS = ["OPS-DO-GUARD-UPTIME-001"] as const;

const TITLE =
  "【実機フェイルセーフ標準】起動時全DO遮断・最大通電リミッター ＆ Uptime/リセット理由テレメトリ仕様";

const SUMMARY =
  "停電復帰や通信断時のリレー固着・電気錠焼損を防ぐ実機側ハード上限タイマー" +
  "（電気錠5秒・警報3分・ライト10分）と、" +
  "ハートビートへのUptime/reset_cause付与による" +
  "24時間3回WDTリセットの隠れ不調自動検知仕様。";

const TAGS = [
  "#フェイルセーフ",
  "#DOリミッター",
  "#Uptime",
  "#WDT監視",
  "#全物件標準",
  "#TiSLY_Core",
];

const BODY = [
  "【起動】",
  "通信の前に DO1〜DO8 を切る。",
  "停電復帰の固着通電を防ぐ。",
  "",
  "【上限】",
  "電気錠は 5 秒。回転灯とベルは 180 秒。",
  "防犯ライトは 600 秒。冷却ファンは切らない。",
  "遮断は次の心拍へ載せる。",
  "",
  "【稼働】",
  "心拍に uptime_sec と reset_reason を足す。",
  "無い旧実機でも受信は失敗にしない。",
  "24時間に WDT が 3 回で社内だけへ警告する。",
  "同じ物件の警告は 6 時間空ける。",
  "お客様画面には稼働時間を出さない。",
].join("\n");

export function getDoGuardModuleSeedItemsV1() {
  return [
    {
      id: DO_GUARD_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-19T04:30:00.000Z",
    },
  ];
}

export function getDoGuardCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: DO_GUARD_CARD_IDS[0],
      title: TITLE,
      category: "IOT関連",
      tags: [...TAGS],
      summary: `${SUMMARY}\n\n${BODY}`,
      body: BODY,
      files: [],
      updatedAt: "2026-11-19",
      sourceType: "manual",
      qnapSyncStatus: "pending",
    },
  ];
}

export function seedDoGuardKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getDoGuardCardSeedInputsV1()) {
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
  const indexed = new Set(index.entries.map((entry) => entry.id));
  const missing = DO_GUARD_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
