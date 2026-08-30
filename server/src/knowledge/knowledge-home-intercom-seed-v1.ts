/**
 * スマートホーム施工・HOME インターホン統合
 * ナレッジ追記（既存データ保護）
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

export interface HomeIntercomModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const HOME_INTERCOM_MODULE_SEED_IDS = [
  "kn-seed-home-intercom-td-sm5030-001",
] as const;

export const HOME_INTERCOM_CARD_IDS = [
  "HOME-INTERCOM-TD-SM5030-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T08:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof HOME_INTERCOM_MODULE_SEED_IDS)[number];
  cardId: (typeof HOME_INTERCOM_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【PWA ポップアップ通知】",
  "呼出信号を検知し、TiSLY HOME（白×navy）へ",
  "リアルタイムの来客ポップアップを表示する。",
  "",
  "【HomeLink 連携】",
  "ワンタップで HomeLink アプリ（homelink://）を起動し、",
  "玄関ドアホンとの通話応答を開始する。",
  "",
  "【RP2350 CH1 解錠】",
  "内蔵リレー CH1 を約 1 秒キックし、",
  "電気錠を遠隔解錠。HOME-JP-ITABASHI-LIVE と一元管理する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-home-intercom-td-sm5030-001",
    cardId: "HOME-INTERCOM-TD-SM5030-001",
    title:
      "【スマートホーム施工】アイリス製Wi-Fiドアホン（TD-SM5030CT-BSH）× RP2350 TiSLY HOME統合仕様",
    tags: [
      "#TiSLY_HOME",
      "#インターホン連携",
      "#電気錠解錠",
      "#RP2350",
      "#TD-SM5030CT-BSH",
    ],
    genre: "セキュリティー",
    category: "防犯カメラ",
    summary: [
      "呼出信号のPWAポップアップ通知、HomeLinkアプリ呼び出し連携、",
      "RP2350内蔵リレーCH1による電気錠遠隔解錠の連動仕様。",
    ].join("\n"),
    body: BODY,
  },
];

export function getHomeIntercomModuleSeedItemsV1(): HomeIntercomModuleSeedItemV1[] {
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

export function getHomeIntercomCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedHomeIntercomKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getHomeIntercomCardSeedInputsV1()) {
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
  const missingInIndex = HOME_INTERCOM_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
