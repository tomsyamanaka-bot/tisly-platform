/**
 * 天文タイマーと通信復旧を末尾追記する。
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

export const ASTRO_RECOVERY_MODULE_SEED_IDS = [
  "kn-seed-astro-recovery-001",
] as const;

export const ASTRO_RECOVERY_CARD_IDS = [
  "OPS-ASTRO-RECOVERY-001",
] as const;

const TITLE =
  "【全物件標準】天文タイマー（日没・日の出自動追従＋タイムゾーン対応）＆ 通信復旧自動通知仕様";

const SUMMARY =
  "外部API不要のサーバー側太陽計算による季節追従型ライト点灯（日没・日の出±オフセット対応、豪州展開を見据えた物件別タイムゾーン保持）と、オフライン状態からの復帰時に停止時間を算出して自動通知する（点検中抑止・15分クールダウン付き）保守標準仕様。";

const TAGS = [
  "#天文タイマー",
  "#自動点灯",
  "#タイムゾーン",
  "#通信復旧通知",
  "#全物件標準",
  "#TiSLY_Core",
];

const BODY = [
  "点灯時刻はサーバーが計算し、既存の開始終了へ流す。",
  "実機の Python と版は変えない。",
  "初期は手動。画面から天文へ切り替えられる。",
  "日没の既定は15分前。日の出の既定は15分後。",
  "時刻の基準は物件ごとの秒オフセット。日本は 32400。",
  "通信が5分30秒途絶したら開始時刻を覚える。",
  "通知を出したあと復帰したら停止時間を付ける。",
  "点検中はログだけで、Push は出さない。",
  "同じ物件の復旧通知は15分あける。",
].join("\n");

export function getAstroRecoveryModuleSeedItemsV1() {
  return [
    {
      id: ASTRO_RECOVERY_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-20T06:00:00.000Z",
    },
  ];
}

export function getAstroRecoveryCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: ASTRO_RECOVERY_CARD_IDS[0],
      title: TITLE,
      category: "IOT関連",
      tags: [...TAGS],
      summary: `${SUMMARY}\n\n${BODY}`,
      body: BODY,
      files: [],
      updatedAt: "2026-11-20",
      sourceType: "manual",
      qnapSyncStatus: "pending",
    },
  ];
}

export function seedAstroRecoveryKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getAstroRecoveryCardSeedInputsV1()) {
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
  const missing = ASTRO_RECOVERY_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
