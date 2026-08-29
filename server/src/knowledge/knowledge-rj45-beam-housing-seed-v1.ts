/**
 * 製品化DX・RJ45ビームハウジング
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

export interface Rj45BeamHousingModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const RJ45_BEAM_HOUSING_MODULE_SEED_IDS = [
  "kn-seed-rj45-beam-housing-001",
] as const;

export const RJ45_BEAM_HOUSING_CARD_IDS = [
  "SEC-RJ45-BEAM-HOUSING-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T22:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type Def = {
  moduleId: (typeof RJ45_BEAM_HOUSING_MODULE_SEED_IDS)[number];
  cardId: (typeof RJ45_BEAM_HOUSING_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const BODY = [
  "【万能ベースプレート】",
  "φ48.6 単管・支柱用 R 溝を設け、",
  "ステンレスバンド／U ボルト取付に対応。",
  "壁面用の四隅ビス穴も同一プレートに一体化する。",
  "",
  "【RJ45 プラグ＆プレイ】",
  "市販ビームセンサーを TiSLY ブランド筐体へ再定義。",
  "RJ45 基板とブランドロゴモールドを内蔵し、",
  "配線・取付の施工工数を半減する。",
  "",
  "【高付加価値化】",
  "ポール／壁面の両対応で現場選択を一本化し、",
  "白ベース×navy の PWA で寸法・STL を共有する。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-rj45-beam-housing-001",
    cardId: "SEC-RJ45-BEAM-HOUSING-001",
    title:
      "【製品化DX】TiSLYオリジナル・ポール＆壁面両対応RJ45ビームセンサーハウジング設計",
    tags: [
      "#自社ブランド化",
      "#ビームセンサー",
      "#単管マウント",
      "#壁面取付",
      "#RJ45",
      "#TiSLY_Security",
      "#PWA",
    ],
    genre: "セキュリティー",
    category: "防犯カメラ",
    summary: [
      "市販ビームセンサーをTiSLYブランド製品として再定義するカスタム筐体。",
      "φ48.6単管・支柱用R溝（ステンレスバンド/Uボルト対応）と壁面用四隅ビス穴を一体化した万能ベースプレートを設計。",
      "RJ45プラグ＆プレイ基板とブランドロゴモールドを内蔵し、施工工数を半減させつつ高付加価値化を実現。",
    ].join("\n"),
    body: BODY,
  },
];

export function getRj45BeamHousingModuleSeedItemsV1(): Rj45BeamHousingModuleSeedItemV1[] {
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

export function getRj45BeamHousingCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedRj45BeamHousingKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRj45BeamHousingCardSeedInputsV1()) {
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
  const missingInIndex = RJ45_BEAM_HOUSING_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
