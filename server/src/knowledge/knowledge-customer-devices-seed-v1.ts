/**
 * 顧客・機器マスター台帳ナレッジ
 * docs/CUSTOMER_DEVICES.md 連動
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

export interface CustomerDevicesModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const CUSTOMER_DEVICES_MODULE_SEED_IDS = [
  "kn-seed-customer-devices-master-001",
] as const;

export const CUSTOMER_DEVICES_CARD_IDS = [
  "OPS-CUSTOMER-DEVICES-001",
] as const;

const SEED_CREATED_AT = "2026-09-07T06:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-07";

const TITLE =
  "【運用DX】現場別機器マスター台帳（CUSTOMER_DEVICES.md）によるAI遠隔保守・障害自走対応仕様";

const TAGS = [
  "#顧客台帳",
  "#障害対応",
  "#現場カルテ",
  "#遠隔保守",
  "#運用DX",
  "#TiSLY_Core",
];

const SUMMARY = [
  "顧客名（現場名）をトリガーとして、AIが物件固有の",
  "RP2350端子番号・Modbus ID・パラメータ・通信構成を",
  "即座に参照し、ピンポイントで障害解析・設定変更・",
  "自動デプロイを完結させる保守DXパイプライン。",
].join("");

const BODY = [
  "【台帳の正】",
  "docs/CUSTOMER_DEVICES.md を現場カルテの正とする。",
  "豊島邸（TOYOSHIMA001）と板橋自宅（TOMS001）を収録。",
  "",
  "【顧客名トリガー】",
  "指示に「豊島邸」「板橋自宅」等が含まれる場合、",
  "必ず台帳から customerCode / siteId / DI·DO を特定。",
  "別物件の端子を推測で変更してはならない。",
  "",
  "【豊島邸の要点】",
  "主装置 8ch: DI1/DI2 ビーム、DO1/DO2 ライト、DO3 パト。",
  "子機 6ch: DI1 道路、DI2 通路、DO1 ライト、DO2 パト。",
  "RS485 Modbus スレーブ ID:01（はなれ現場割当）。",
  "点灯 18:00〜06:00 · 45秒 · デバウンス 100ms。",
  "",
  "【板橋自宅の要点】",
  "DI1 駐車場、DI2 ガレージ、CH1 電気錠ワンショット。",
  "TD-SM5030CT-BSH / HomeLink 連動。",
  "日またぎ点灯判定（isWithinTimeRange）· 維持 45秒。",
  "",
  "【自走パイプライン】",
  "台帳参照 → 設定変更 → build/test → commit/push →",
  "https://tisly.jp/api/health の commitShort 確認。",
].join("\n");

type Def = {
  moduleId: (typeof CUSTOMER_DEVICES_MODULE_SEED_IDS)[number];
  cardId: (typeof CUSTOMER_DEVICES_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-customer-devices-master-001",
    cardId: "OPS-CUSTOMER-DEVICES-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getCustomerDevicesModuleSeedItemsV1(): CustomerDevicesModuleSeedItemV1[] {
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

export function getCustomerDevicesCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedCustomerDevicesKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getCustomerDevicesCardSeedInputsV1()) {
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
  const missingInIndex = CUSTOMER_DEVICES_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
