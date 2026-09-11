/**
 * RP2350 出荷判定 RGB 自己診断ナレッジ
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

export interface Rp2350RgbKittingModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const RP2350_RGB_KITTING_MODULE_SEED_IDS = [
  "kn-seed-rp2350-rgb-kitting-001",
] as const;

export const RP2350_RGB_KITTING_CARD_IDS = [
  "OPS-RP2350-RGB-KITTING-001",
] as const;

const SEED_CREATED_AT = "2026-09-11T09:30:00.000Z";
const SEED_UPDATED_AT = "2026-09-11";

const TITLE =
  "【製造・キッティングDX】RP2350オンボードRGBによる出荷判定＆自己診断インジケーター仕様";

const TAGS = [
  "#出荷検査",
  "#RGBインジケーター",
  "#キッティング",
  "#RP2350",
  "#保守DX",
  "#TiSLY_Core",
];

const SUMMARY = [
  "物件設定・センサー定義・OTA設定の投入後、実機単体で",
  "VPS疎通と整合性を自己診断。PCや画面を見ずとも",
  "「赤（未完了）➔ 青（設定済）➔ 緑点滅（出荷OK）」で",
  "現場持出判定を可能にする製造フロー標準化。",
].join("");

const BODY = [
  "【RGB】GPIO2 / WS2812",
  "赤点滅: 未設定または通信異常",
  "青点滅: 設定済・ネット疎通待ち",
  "緑呼吸: 出荷OK（SHIPPABLE）",
  "",
  "【自己診断】tisly_self_test.py",
  "config.json（または config.py）",
  "LAN/DHCP + tisly.jp HTTP",
  "初回ハートビート 200",
  "OTA version API",
  "",
  "【永続化】shippable.json",
  "再起動後オフラインは青、疎通で緑。",
].join("\n");

type Def = {
  moduleId: (typeof RP2350_RGB_KITTING_MODULE_SEED_IDS)[number];
  cardId: (typeof RP2350_RGB_KITTING_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-rp2350-rgb-kitting-001",
    cardId: "OPS-RP2350-RGB-KITTING-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getRp2350RgbKittingModuleSeedItemsV1(): Rp2350RgbKittingModuleSeedItemV1[] {
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

export function getRp2350RgbKittingCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedRp2350RgbKittingKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRp2350RgbKittingCardSeedInputsV1()) {
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
  const missing = RP2350_RGB_KITTING_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
