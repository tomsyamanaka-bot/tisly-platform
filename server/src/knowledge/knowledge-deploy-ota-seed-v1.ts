/**
 * デプロイ連動の全現場 OTA 予約
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

export interface DeployOtaModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const DEPLOY_OTA_MODULE_SEED_IDS = [
  "kn-seed-deploy-ota-all-sites-001",
] as const;

export const DEPLOY_OTA_CARD_IDS = ["OPS-DEPLOY-OTA-ALL-SITES-001"] as const;

const SEED_CREATED_AT = "2026-11-16T10:00:00.000Z";
const SEED_UPDATED_AT = "2026-11-16";

const TITLE = "【保守DX】デプロイ連動・全顧客実機（RP2350）強制OTA自動化仕様";

const TAGS = [
  "#OTA",
  "#強制アップデート",
  "#自動化",
  "#保守DX",
  "#TiSLY_Core",
];

const SUMMARY =
  "サーバー側コードの更新・デプロイ完了時、自動で全テナントのOTA配信予約フラグをONにし、各現場の実機へ次回のハートビート通信時に強制的に最新ファームウェアを適用させるノータッチ保守パイプライン。";

const BODY = [
  "【起動】",
  "サーバーが新しい製品版で起動したとき、豊島邸・板橋自宅・龍ヶ崎店・Keep Rising の配信予約をまとめて付ける。",
  "同じ版の再起動では予約をやり直さない。",
  "",
  "【実機】",
  "各現場は自分のスクリプトだけを受け取る。",
  "配る版が実機の申告より新しいとき、次のハートビートで受け取って再起動する。",
  "板橋は 1.6 系のまま。1.2 系へは上げない。",
  "",
  "【保護】",
  "force は付けない。",
  "config.py は上書きしない。",
  "保存済みの点灯設定と顧客データは書き換えない。",
  "社内入口は /app、お客様入口は /customer。",
].join("\n");

type Def = {
  moduleId: (typeof DEPLOY_OTA_MODULE_SEED_IDS)[number];
  cardId: (typeof DEPLOY_OTA_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-deploy-ota-all-sites-001",
    cardId: "OPS-DEPLOY-OTA-ALL-SITES-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getDeployOtaModuleSeedItemsV1(): DeployOtaModuleSeedItemV1[] {
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

export function getDeployOtaCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedDeployOtaKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getDeployOtaCardSeedInputsV1()) {
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
  const missing = DEPLOY_OTA_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
