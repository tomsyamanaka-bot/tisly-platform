/**
 * 社内通知の受信ルールを末尾追記する。
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

export const STAFF_NOTIFY_MODULE_SEED_IDS = [
  "kn-seed-staff-notify-policy-001",
] as const;

export const STAFF_NOTIFY_CARD_IDS = [
  "OPS-STAFF-NOTIFY-POLICY-001",
] as const;

const TITLE =
  "【通知運用標準】社内（/app）通知フィルタリング：自社常時ON × 他現場は点検・作業時のみ自動一時受信";

const SUMMARY =
  "顧客増加時の通知疲れを防ぐため、板橋自宅は常時受信、" +
  "他現場の通常センサー通知はデフォルトOFFとし、" +
  "点検中モード連動または一時タイマー（自動OFF復帰）時のみ社内受信する標準仕様。" +
  "機器障害（通信断・65℃高温・WDT頻発・異常連打）は" +
  "別枠の保守異常アラートとして分離管理する。";

const TAGS = [
  "#通知設計",
  "#保守DX",
  "#点検モード連動",
  "#全物件標準",
  "#TiSLY_Core",
];

const BODY = [
  "【分け方】",
  "通常イベントはセンサー、テスト、ライト。",
  "保守異常は通信断、65℃、WDT、連打。",
  "",
  "【初期値】",
  "板橋自宅は通常も保守も常時ON。",
  "他現場の通常はOFF。保守異常はON。",
  "新しい現場も同じ初期値になる。",
  "",
  "【一時受信】",
  "点検中は施主へ出さず社内へ出す。",
  "作業タイマーは30分、2時間、4時間。",
  "期限が来たら社内の通常は止まる。",
  "お客様画面にはこの設定を出さない。",
].join("\n");

export function getStaffNotifyModuleSeedItemsV1() {
  return [
    {
      id: STAFF_NOTIFY_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-19T05:50:00.000Z",
    },
  ];
}

export function getStaffNotifyCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: STAFF_NOTIFY_CARD_IDS[0],
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

export function seedStaffNotifyKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getStaffNotifyCardSeedInputsV1()) {
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
  const missing = STAFF_NOTIFY_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
