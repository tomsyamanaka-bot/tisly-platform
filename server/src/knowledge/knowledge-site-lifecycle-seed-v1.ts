/**
 * 物件と子機の運用を末尾へ足す。
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

export const SITE_LIFECYCLE_MODULE_SEED_IDS = [
  "kn-seed-site-lifecycle-001",
] as const;

export const SITE_LIFECYCLE_CARD_IDS = ["OPS-SITE-LIFECYCLE-001"] as const;

const TITLE =
  "【運用標準】物件ライフサイクル管理（本番/デモ/アーカイブ/安全削除）＆ 子機ユニット増減管理仕様";

const SUMMARY =
  "デモ案件や未設置の子機（はなれ等）による死活監視の誤警報を防ぐため、物件を本番/デモ/アーカイブで分離管理し（本番は誤削除ロック）、物件内の親機・子機ユニットを画面から柔軟に追加・未設置切替・削除できる運用標準。";

const TAGS = [
  "#物件管理",
  "#デモ管理",
  "#子機増設",
  "#アーカイブ",
  "#保守DX",
  "#TiSLY_Core",
];

const BODY = [
  "社内の /app だけに出す。",
  "本番稼働中は、そのまま削除できない。",
  "デモとアーカイブは死活の異常に数えない。",
  "未設置の子機は、途絶あつかいにしない。",
  "親機がオンラインなら、物件もオンライン。",
  "実機の Python と版は変えない。",
].join("\n");

export function getSiteLifecycleModuleSeedItemsV1() {
  return [
    {
      id: SITE_LIFECYCLE_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-20T08:20:00.000Z",
    },
  ];
}

export function getSiteLifecycleCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: SITE_LIFECYCLE_CARD_IDS[0],
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

export function seedSiteLifecycleKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getSiteLifecycleCardSeedInputsV1()) {
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
  const missing = SITE_LIFECYCLE_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
