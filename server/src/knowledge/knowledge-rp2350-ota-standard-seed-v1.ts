/**
 * 全現場 RP2350 OTA 標準規格ナレッジ
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

export interface Rp2350OtaStandardModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const RP2350_OTA_STANDARD_MODULE_SEED_IDS = [
  "kn-seed-rp2350-ota-standard-001",
] as const;

export const RP2350_OTA_STANDARD_CARD_IDS = [
  "OPS-RP2350-OTA-STANDARD-001",
] as const;

const SEED_CREATED_AT = "2026-09-11T08:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-11";

const TITLE =
  "【標準仕様】TiSLY全現場RP2350 PoE LAN経由OTA遠隔アップデート＆A/Bロールバック標準規格";

const TAGS = [
  "#OTA",
  "#RP2350",
  "#全現場標準化",
  "#PoE",
  "#MicroPython",
  "#保守DX",
  "#TiSLY_Core",
];

const SUMMARY = [
  "施工後の現場駆けつけをゼロにする完全遠隔マイコン運用。",
  "PoE LANによる通信・受電を活かし、ConoHa VPSからの",
  "差分スクリプト配信、二重化バックアップによる自己復旧",
  "フェイルセーフを全物件の標準アーキテクチャとして定義。",
].join("");

const BODY = [
  "【配信API】",
  "GET /api/firmware/{siteId}/version",
  "GET /api/firmware/{siteId}/script",
  "POST /api/firmware/{siteId}/deploy",
  "",
  "【実機】",
  "lib/tisly_ota.py が DHCP 直後と HB 時に差分取得。",
  "main_new.py 検証後に main_backup.py へ退避して置換。",
  "",
  "【フェイルセーフ】",
  "起動クラッシュ時は backup から自動ロールバック。",
].join("\n");

type Def = {
  moduleId: (typeof RP2350_OTA_STANDARD_MODULE_SEED_IDS)[number];
  cardId: (typeof RP2350_OTA_STANDARD_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-rp2350-ota-standard-001",
    cardId: "OPS-RP2350-OTA-STANDARD-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getRp2350OtaStandardModuleSeedItemsV1(): Rp2350OtaStandardModuleSeedItemV1[] {
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

export function getRp2350OtaStandardCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedRp2350OtaStandardKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRp2350OtaStandardCardSeedInputsV1()) {
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
  const missing = RP2350_OTA_STANDARD_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
