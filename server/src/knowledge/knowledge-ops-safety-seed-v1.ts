/**
 * 全物件共通の保守セーフティを末尾追記する。
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

export const OPS_SAFETY_MODULE_SEED_IDS = [
  "kn-seed-ops-safety-three-001",
] as const;

export const OPS_SAFETY_CARD_IDS = ["OPS-SAFETY-THREE-001"] as const;

const TITLE =
  "【保守標準】全物件共通セーフティ3点セット（自動復帰点検モード・異常連打ストッパー・盤内高温監視）";

const SUMMARY =
  "人的ミス（監視戻し忘れ）を防ぐタイマー自動復帰型点検モード、" +
  "センサー誤作動時の通知連打を止める45秒クールダウン＆10分10回故障検知、" +
  "夏季の熱暴走を防ぐ55℃注意/65℃社内警報のサーバー側標準仕様。";

const TAGS = [
  "#保守DX",
  "#点検モード",
  "#誤報対策",
  "#盤内温度",
  "#全物件標準",
  "#TiSLY_Core",
];

const BODY = [
  "【点検中】",
  "社内画面で 30分、2時間、4時間を選ぶ。",
  "期限を過ぎると監視へ自動復帰する。",
  "途絶通知と Shelly の自動再投入は止める。",
  "施主への Push は止め、ログには [点検中] を残す。",
  "",
  "【連打】",
  "同じ DI は前回通知から 45 秒、施主へ再送しない。",
  "10分に10回で施主通知を止め、社内だけへ警告する。",
  "",
  "【温度】",
  "55℃以上は社内画面の高温注意。",
  "65℃以上は社内へ高温警報。同一物件は60分空ける。",
  "お客様画面の温度表示はそのまま。",
].join("\n");

export function getOpsSafetyModuleSeedItemsV1() {
  return [
    {
      id: OPS_SAFETY_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-19T04:00:00.000Z",
    },
  ];
}

export function getOpsSafetyCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: OPS_SAFETY_CARD_IDS[0],
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

export function seedOpsSafetyKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getOpsSafetyCardSeedInputsV1()) {
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
  const missing = OPS_SAFETY_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
