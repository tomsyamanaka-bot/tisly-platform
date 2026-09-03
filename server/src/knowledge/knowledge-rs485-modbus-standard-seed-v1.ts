/**
 * RS485 Modbus 既製品ハック標準ナレッジ
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

export interface Rs485ModbusStandardModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const RS485_MODBUS_STANDARD_MODULE_SEED_IDS = [
  "kn-seed-rs485-modbus-hw-standard-001",
  "kn-seed-rs485-modbus-addr-kitting-001",
] as const;

export const RS485_MODBUS_STANDARD_CARD_IDS = [
  "HARD-RS485-MODBUS-STANDARD-001",
  "OPS-RS485-MODBUS-ADDR-KITTING-001",
] as const;

const SEED_CREATED_AT = "2026-09-03T08:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-03";

type Def = {
  moduleId: (typeof RS485_MODBUS_STANDARD_MODULE_SEED_IDS)[number];
  cardId: (typeof RS485_MODBUS_STANDARD_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY_HW = [
  "【方針】",
  "現場加工（基板剥き出し・ケース切削・ハンダ）は完全廃止。",
  "防水ケース・端子台（A/B線）付きの産業用・市販一体型を採用。",
  "",
  "【採用例】",
  "・RS485 壁掛け NFC リーダー",
  "・Modbus ミリ波レーダー",
  "・DIN レール pH/EC 送信機",
  "",
  "【配線】",
  "RP2350 緑色端子台から A/B 2本線で数珠つなぎ",
  "（デイジーチェーン）。最大約 1.2km・ノイズフリー伝送。",
  "",
  "【効果】",
  "施工時間短縮・品質均一化・再発トラブル削減。",
  "TiSLY ハード選定の標準とする。",
].join("\n");

const BODY_ADDR = [
  "【目的】",
  "複数台接続時のスレーブ ID 重複を事前に防ぐ。",
  "",
  "【アドレス設定の3手段】",
  "① DIP スイッチ型（手動切替）",
  "② 本体ボタン・液晶型",
  "   （CAL/MODE 長押し → Addr 変更）",
  "③ Modbus ファンクション 06 で書き換え",
  "",
  "【運用ルール】",
  "現場高所作業を避け、事務所デスク上で",
  "アドレス割り振り＋テプラ貼付を完了させる。",
  "搬入前チェックリストに ID 表を添付する。",
  "",
  "【現場】",
  "デイジーチェーン接続後は ID ポーリングで",
  "重複・欠落がないことだけを確認する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-rs485-modbus-hw-standard-001",
    cardId: "HARD-RS485-MODBUS-STANDARD-001",
    title:
      "【ハード選定標準】既製品ハック（一体型）によるRS485 Modbus現場施工標準",
    tags: [
      "#ハード選定",
      "#既製品ハック",
      "#RS485",
      "#ModbusRTU",
      "#配線省力化",
      "#TiSLY標準",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "現場加工（基板剥き出し、ケース切削、ハンダ付け）を完全廃止。",
      "最初から防水ケース・端子台（A/B線）を備えた産業用・市販一体型モジュール",
      "（RS485壁掛けNFC、Modbusミリ波、DINレールpH/EC等）を採用。",
      "RP2350の緑色端子台から2本線で数珠つなぎ（デイジーチェーン）し、",
      "最大1.2km・ノイズフリーで伝送。",
    ].join("\n"),
    body: BODY_HW,
  },
  {
    moduleId: "kn-seed-rs485-modbus-addr-kitting-001",
    cardId: "OPS-RS485-MODBUS-ADDR-KITTING-001",
    title:
      "【現場運用標準】RS485 Modbus既製品アドレス設定＆事前キッティング手順",
    tags: [
      "#Modbusアドレス",
      "#事前キッティング",
      "#アドレス書き換え",
      "#現場トラブル防止",
      "#TiSLY運用",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "複数台接続時のID重複防止運用。",
      "①DIPスイッチ型（手動切替）、",
      "②本体ボタン・液晶型（CAL/MODE長押し➔Addr変更）、",
      "③Modbusファンクション06コマンド書き換え。",
      "現場高所作業を避け、事務所デスク上で事前に",
      "アドレス割り振り＋テプラ貼付を終える運用ルール。",
    ].join("\n"),
    body: BODY_ADDR,
  },
];

export function getRs485ModbusStandardModuleSeedItemsV1(): Rs485ModbusStandardModuleSeedItemV1[] {
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

export function getRs485ModbusStandardCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedRs485ModbusStandardKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRs485ModbusStandardCardSeedInputsV1()) {
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
  const missingInIndex = RS485_MODBUS_STANDARD_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
