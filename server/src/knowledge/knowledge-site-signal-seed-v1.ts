/**
 * 信号機一覧を末尾へ足す。
 * 既存のカードは消さない。
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

export const SITE_SIGNAL_MODULE_SEED_IDS = [
  "kn-seed-site-signal-001",
] as const;

export const SITE_SIGNAL_CARD_IDS = ["OPS-SITE-SIGNAL-001"] as const;

const TITLE =
  "【保守DX】全物件「信号機」一覧ダッシュボード（/app 異常優先ソート ＆ ワンタップ切替）";

const SUMMARY =
  "複数現場の増加に対応するため、全物件の通信・盤内温度・WDT頻発・OTA差分・点検中状態をサーバー側で3段階（🔴異常・🟡注意・🟢正常）に自動判定し、異常現場を最上部へ自動表示してワンタップで詳細操作へ遷移できる社内監視標準UI。";

const TAGS = [
  "#信号機一覧",
  "#一覧ダッシュボード",
  "#保守DX",
  "#異常優先ソート",
  "#全物件標準",
  "#TiSLY_Core",
];

const BODY = [
  "社内の /app だけに出す。",
  "お客様の /customer には出さない。",
  "異常、注意、正常の順に並べる。",
  "点検中の途絶は注意にする。",
  "65℃と再起動の頻発は異常。",
  "行を押すと、その現場の詳細へ切り替わる。",
  "実機の Python と版は変えない。",
].join("\n");

export function getSiteSignalModuleSeedItemsV1() {
  return [
    {
      id: SITE_SIGNAL_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-20T07:40:00.000Z",
    },
  ];
}

export function getSiteSignalCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: SITE_SIGNAL_CARD_IDS[0],
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

export function seedSiteSignalKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getSiteSignalCardSeedInputsV1()) {
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
  const missing = SITE_SIGNAL_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
