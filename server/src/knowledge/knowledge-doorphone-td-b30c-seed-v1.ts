/**
 * TD-B30C スマートドアホン PWA 統合ナレッジ
 * 既存データ保護のうえ末尾追記
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

export interface DoorphoneTdB30cModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const DOORPHONE_TD_B30C_MODULE_SEED_IDS = [
  "kn-seed-doorphone-td-b30c-pwa-001",
] as const;

export const DOORPHONE_TD_B30C_CARD_IDS = [
  "HOME-DOORPHONE-TD-B30C-001",
] as const;

const SEED_CREATED_AT = "2026-09-01T07:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-01";

type Def = {
  moduleId: (typeof DOORPHONE_TD_B30C_MODULE_SEED_IDS)[number];
  cardId: (typeof DOORPHONE_TD_B30C_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【PWA DoorphoneCard / Viewer】",
  "白×navy UI · ライブ/静止画プレビュー ·",
  "LIVE/録画中/呼出中バッジ · 大型操作ボタン。",
  "",
  "【来客Push → ワンタップ通話】",
  "TD-B30C 呼出を TiSLY PWA が捕捉。",
  "irisdoorphone:// Deep Link で専用アプリ起動。",
  "",
  "【RP2350 電気錠連動】",
  "解錠ボタン → RO1 約1秒パルス →",
  "POST /api/home/v1/control unlock_door。",
  "",
  "【拡張 API】",
  "POST /api/home/v1/doorphone/control",
  "（mic / speaker / snapshot / record）。",
  "GET /api/home/v1/doorphone/snapshot（SVG モック）。",
  "",
  "【モック物件】",
  "HOME-JP-TSUKUBA-001 · HOME-AU-GOLDCOAST-001。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-doorphone-td-b30c-pwa-001",
    cardId: "HOME-DOORPHONE-TD-B30C-001",
    title:
      "【住設・インターホン】アイリスオーヤマ製スマートドアホン（TD-B30C）のPWA統合と電気錠連動ハック",
    tags: [
      "#Doorphone",
      "#IrisOhyama",
      "#TD_B30C",
      "#Intercom",
      "#SmartLock",
      "#PWA",
      "#TiSLY_HOME",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "TD-B30Cの来客プッシュ通知をTiSLY PWAで捕捉し、",
      "外出先からのワンタップ通話起動および",
      "RP2350接点出力による玄関電気錠の",
      "遠隔解錠をワンストップで実現する設計。",
    ].join("\n"),
    body: BODY,
  },
];

export function getDoorphoneTdB30cModuleSeedItemsV1(): DoorphoneTdB30cModuleSeedItemV1[] {
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

export function getDoorphoneTdB30cCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedDoorphoneTdB30cKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getDoorphoneTdB30cCardSeedInputsV1()) {
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
  const missingInIndex = DOORPHONE_TD_B30C_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
