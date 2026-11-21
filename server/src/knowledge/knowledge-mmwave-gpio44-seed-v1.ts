/**
 * GPIO44 直結のミリ波レーダー。
 * 既存カードは消さず、末尾に足す。
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

export interface MmwaveGpio44ModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const MMWAVE_GPIO44_MODULE_SEED_IDS = [
  "kn-seed-mmwave-gpio44-001",
] as const;

export const MMWAVE_GPIO44_CARD_IDS = ["OPS-MMWAVE-GPIO44-001"] as const;

const SEED_CREATED_AT = "2026-11-21T10:00:00.000Z";
const SEED_UPDATED_AT = "2026-11-21";

const TITLE =
  "【センサーハック】Waveshare RP2350 ピンヘッダGPIO44直結 ミリ波レーダー（HLK-LD2410C）配線・滞留検知標準";

const TAGS = [
  "#ミリ波レーダー",
  "#HLK-LD2410C",
  "#GPIO44",
  "#プレ防犯",
  "#滞留検知",
  "#TiSLY標準",
];

const SUMMARY =
  "24V仕様の緑DI端子台ではなく、3.3V直結可能なピンヘッダGPIO44へHLK-LD2410CのOUTピン（High level設定）を接続し、5秒滞留判定と即時Push通知・夜間ライト連動を実現する低コストプレ防犯標準。";

const BODY = [
  "【配線】",
  "HLK-LD2410C の OUT は、Waveshare RP2350 のピンヘッダ GPIO44 へ直結する。",
  "電源は 5V、GND は基板の G。緑の 24V DI 端子台には載せない。",
  "レーダー側の Trigger level は High level。入力はプルダウン。",
  "検知距離の設定は 2.25m。",
  "DI1〜DI8（GPIO9–16）と DO1〜DO8（GPIO17–24）は変えない。",
  "",
  "【判定】",
  "100ms のデバウンス後、HIGH の瞬間を接近とする。",
  "HIGH が滞留秒（初期値 5 秒）続いたら、窓際・エリア滞留警報とする。",
  "LOW に戻るまで、同じイベントは再送しない。",
  "送信は 5 分の心拍を待たず、その場で HTTP POST する。",
  "",
  "【ライトと通知】",
  "夜間の保存時間帯、または昼間テストがオンのときだけ、",
  "滞留で DO2 と DO3 を点ける。CH1 の電気錠は動かさない。",
  "点灯は既存の維持秒。上限は 600 秒。",
  "接近と滞留は履歴へ残し、登録端末へ Push する。クリアは再送しない。",
  "config.py は OTA で上書きしない。force: true は使わない。",
].join("\n");

type Def = {
  moduleId: (typeof MMWAVE_GPIO44_MODULE_SEED_IDS)[number];
  cardId: (typeof MMWAVE_GPIO44_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-mmwave-gpio44-001",
    cardId: "OPS-MMWAVE-GPIO44-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getMmwaveGpio44ModuleSeedItemsV1(): MmwaveGpio44ModuleSeedItemV1[] {
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

export function getMmwaveGpio44CardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedMmwaveGpio44KnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getMmwaveGpio44CardSeedInputsV1()) {
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
  const missing = MMWAVE_GPIO44_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
