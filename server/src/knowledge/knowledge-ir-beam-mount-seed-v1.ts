/**
 * 防犯DX・赤外線ビーム単管マウント架台
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

export interface IrBeamMountModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const IR_BEAM_MOUNT_MODULE_SEED_IDS = [
  "kn-seed-ir-beam-mount-visor-001",
] as const;

export const IR_BEAM_MOUNT_CARD_IDS = [
  "SEC-IR-BEAM-MOUNT-VISOR-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T18:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type Def = {
  moduleId: (typeof IR_BEAM_MOUNT_MODULE_SEED_IDS)[number];
  cardId: (typeof IR_BEAM_MOUNT_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【単管ダイレクト取付】",
  "市販の対向型赤外線ビームセンサー向けに、",
  "φ48.6 単管・フェンス支柱へ直接固定する",
  "3D プリントブラケットを設計する。",
  "",
  "【誤報防止バイザー】",
  "西日・積雪による誤報を抑えるロングサンバイザーを",
  "一体造形。光軸微調整機構と配線ボックスも同梱する。",
  "",
  "【施工効果】",
  "外構セキュリティの取付・調整工数を半減し、",
  "白ベース×navy の PWA で寸法・STL を現場共有する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-ir-beam-mount-visor-001",
    cardId: "SEC-IR-BEAM-MOUNT-VISOR-001",
    title:
      "【防犯DX】赤外線ビームセンサー用 単管マウント架台＆誤報防止バイザー設計",
    tags: [
      "#赤外線ビーム",
      "#防犯設備",
      "#単管マウント",
      "#誤報防止",
      "#3Dプリンター",
      "#TiSLY_Security",
      "#PWA",
    ],
    genre: "セキュリティー",
    category: "防犯カメラ",
    summary: [
      "市販の対向型赤外線ビームセンサーに対し、φ48.6単管・フェンス支柱へのダイレクト取付ブラケットおよび",
      "西日・積雪誤報を防ぐロングサンバイザーを3Dプリント設計。",
      "光軸微調整機構と配線ボックスを一体化し、外構セキュリティの施工工数を半減。",
    ].join("\n"),
    body: BODY,
  },
];

export function getIrBeamMountModuleSeedItemsV1(): IrBeamMountModuleSeedItemV1[] {
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

export function getIrBeamMountCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedIrBeamMountKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getIrBeamMountCardSeedInputsV1()) {
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
  const missingInIndex = IR_BEAM_MOUNT_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
