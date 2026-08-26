/**
 * 現場DX・音声AIナレッジ追記
 * （通話テキスト→カレンダー・材料連携）
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

export interface VoiceCallModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const VOICE_CALL_MODULE_SEED_IDS = [
  "kn-seed-voice-call-calendar-dx-001",
] as const;

export const VOICE_CALL_CARD_IDS = [
  "VOICE-CALL-CALENDAR-DX-001",
] as const;

const SEED_CREATED_AT = "2026-08-26T21:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-26";

type VoiceCallSeedDef = {
  moduleId: (typeof VOICE_CALL_MODULE_SEED_IDS)[number];
  cardId: (typeof VOICE_CALL_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const VOICE_DX_BODY = [
  "【ワークフロー】",
  "市販イヤホン（骨伝導等）や通話録音アプリで",
  "得たテキストを、PWA「通話音声・クイック入力」",
  "へワンタップ貼付する。Web Speech API による",
  "その場の文字起こしも併用できる。",
  "",
  "【LLM プロンプト設計】",
  "Gemini に JSON のみを返させる。抽出項目は",
  "予定（件名・開始・終了・場所）、材料",
  "（品名・数量・単位・発注フラグ）、案件メモ",
  "（3行要約・要望・決定事項）。キー未設定時は",
  "ルールベース抽出にフォールバックする。",
  "",
  "【データフロー】",
  "抽出プレビュー確認後、ワンタップで",
  "Google Calendar API（mock/real）へ予定登録し、",
  "同時に材料チェックへ部材を追記、案件メモへ",
  "要約を保存する。tenant_id / JP|AU / JPY|AUD",
  "を意識した拡張ポイントをログに残す。",
].join("\n");

const DEFS: VoiceCallSeedDef[] = [
  {
    moduleId: "kn-seed-voice-call-calendar-dx-001",
    cardId: "VOICE-CALL-CALENDAR-DX-001",
    title:
      "【現場DX・音声AI】通話録音テキストからのGoogleカレンダー自動同期＆材料自動抽出アーキテクチャ",
    tags: ["#VoiceAI", "#Gemini", "#Calendar", "#FieldDX", "#PWA"],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "市販イヤホン（骨伝導等）での通話テキストをPWAへ受け渡すワークフロー。",
      "Geminiによる日程・現場名・材料リストの自動構造化とJSON抽出。",
      "通話後ワンタップでGoogleカレンダーとTiSLY材料チェックへ同時登録する省力化。",
    ].join("\n"),
    body: VOICE_DX_BODY,
  },
];

export function getVoiceCallModuleSeedItemsV1(): VoiceCallModuleSeedItemV1[] {
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

export function getVoiceCallCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedVoiceCallKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getVoiceCallCardSeedInputsV1()) {
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
  const missingInIndex = VOICE_CALL_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
