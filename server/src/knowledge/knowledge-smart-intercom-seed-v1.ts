/**
 * 施工DX・スマートインターホン連携
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

export interface SmartIntercomModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const SMART_INTERCOM_MODULE_SEED_IDS = [
  "kn-seed-smart-intercom-td-sm5030-001",
] as const;

export const SMART_INTERCOM_CARD_IDS = [
  "SEC-SMART-INTERCOM-TD-SM5030-001",
] as const;

const SEED_CREATED_AT = "2026-08-30T07:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-30";

type Def = {
  moduleId: (typeof SMART_INTERCOM_MODULE_SEED_IDS)[number];
  cardId: (typeof SMART_INTERCOM_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【呼出検知】",
  "アイリスオーヤマ TD-SM5030CT-BSH の呼出移報を",
  "親機 RP2350 の DI 端子またはクラウド API で検知する。",
  "",
  "【PWA 来客応答】",
  "白ベース×navy の TiSLY PWA にリアルタイムポップアップを表示。",
  "ワンタップで HomeLink（homelink://）通話を起動する。",
  "",
  "【電気錠遠隔解錠】",
  "内蔵リレー CH1 を約 1 秒キックし、",
  "スマート電気錠を遠隔解錠。設計・施工・月額監視を一元化する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-smart-intercom-td-sm5030-001",
    cardId: "SEC-SMART-INTERCOM-TD-SM5030-001",
    title:
      "【施工DX】スマートインターホン（TD-SM5030CT-BSH）PWA応答・電気錠遠隔解錠連携仕様",
    tags: [
      "#スマートドアホン",
      "#PWA来客応答",
      "#電気錠解錠",
      "#RP2350",
      "#リレー連動",
      "#TiSLY_Security",
    ],
    genre: "セキュリティー",
    category: "防犯カメラ",
    summary: [
      "アイリスオーヤマ製Wi-Fiドアホン（TD-SM5030CT-BSH）の呼出移報信号を親機（RP2350）のDI端子またはクラウドAPIで検知。",
      "TiSLY PWA（白ベース×navy UI）上へリアルタイムに来客ポップアップを表示し、ワンタップ通話起動リンク（HomeLink連携）および内蔵リレー（CH1）によるスマート電気錠の遠隔解錠操作を一元提供。",
    ].join("\n"),
    body: BODY,
  },
];

export function getSmartIntercomModuleSeedItemsV1(): SmartIntercomModuleSeedItemV1[] {
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

export function getSmartIntercomCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedSmartIntercomKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getSmartIntercomCardSeedInputsV1()) {
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
  const missingInIndex = SMART_INTERCOM_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
