/**
 * RP2350 × RS485 NFC 勤怠打刻ナレッジ
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

export interface AttendanceNfcModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const ATTENDANCE_NFC_MODULE_SEED_IDS = [
  "kn-seed-attendance-nfc-rs485-001",
] as const;

export const ATTENDANCE_NFC_CARD_IDS = ["OPS-ATTENDANCE-NFC-001"] as const;

const SEED_CREATED_AT = "2026-09-02T13:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-02";

type Def = {
  moduleId: (typeof ATTENDANCE_NFC_MODULE_SEED_IDS)[number];
  cardId: (typeof ATTENDANCE_NFC_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【ハード構成】",
  "産業用 RS485 RFID/NFC リーダー、",
  "または UART 接続 PN532 を RP2350 へ直結。",
  "Suica / スマホ NFC の UID を現場で読取。",
  "",
  "【勤怠クラウド連携】",
  "タッチ検知 → POST /api/attendance/v1/punch。",
  "出退勤ログを tenant 単位で自動記録。",
  "App Hub にリアルタイム一覧反映。",
  "",
  "【電気錠連動 CH1】",
  "打刻成功と同時にリレー CH1 を約1秒パルス。",
  "RP2350 RO1 → 電気錠解錠を一元制御。",
  "unlock_door と同系の安全インターロック。",
  "",
  "【現場 PWA】",
  "/app 勤怠カードで出勤/退勤シミュレーション。",
  "白×navy UI · 社員名 · 解錠ステータス表示。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-attendance-nfc-rs485-001",
    cardId: "OPS-ATTENDANCE-NFC-001",
    title:
      "【設備DX】RP2350直結 RS485 NFCリーダーによる勤怠打刻・出退勤管理＆電気錠連動仕様",
    tags: [
      "#勤怠管理",
      "#出退勤打刻",
      "#NFCリーダー",
      "#RS485",
      "#電気錠連動",
      "#RP2350",
      "#TiSLY_Core",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "産業用RS485 RFID/NFCリーダー（またはUART接続PN532）を",
      "RP2350へ接続。SuicaやスマホNFCのタッチ情報を読み取り、",
      "出退勤ログのクラウド自動記録と同時に",
      "リレーCH1による電気錠解錠を実行する一元管理仕様。",
    ].join("\n"),
    body: BODY,
  },
];

export function getAttendanceNfcModuleSeedItemsV1(): AttendanceNfcModuleSeedItemV1[] {
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

export function getAttendanceNfcCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedAttendanceNfcKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getAttendanceNfcCardSeedInputsV1()) {
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
  const missingInIndex = ATTENDANCE_NFC_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
