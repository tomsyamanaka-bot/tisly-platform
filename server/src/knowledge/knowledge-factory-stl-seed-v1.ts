/**
 * 製造DX・方眼紙スケッチ → STL 生成
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

export interface FactoryStlModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const FACTORY_STL_MODULE_SEED_IDS = [
  "kn-seed-factory-stl-gemini-001",
] as const;

export const FACTORY_STL_CARD_IDS = [
  "FACTORY-STL-GEMINI-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type FactoryStlSeedDef = {
  moduleId: (typeof FACTORY_STL_MODULE_SEED_IDS)[number];
  cardId: (typeof FACTORY_STL_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const FACTORY_STL_BODY = [
  "【現場フロー】",
  "方眼紙に手書きした 2D スケッチと寸法文字を",
  "PWA カメラ（capture=environment）で撮影する。",
  "アルバム取込も可。暗い現場でも白ベース UI で",
  "プレビュー確認し、解析へ進む。",
  "",
  "【Gemini Vision 抽出】",
  "Gemini Vision API が外形・穴位置・板厚・ねじ径",
  "などから OpenSCAD / 3D パラメータを構造化する。",
  "失敗時はルールベース寸法テンプレへフォールバック。",
  "",
  "【Three.js → STL】",
  "ブラウザ上で Three.js プレビュー後、ワンタップで",
  "STL を出力。現場特化ブラケット・IoT ボックスを",
  "即時 3D プリントし、設計〜施工を短縮する。",
].join("\n");

const DEFS: FactoryStlSeedDef[] = [
  {
    moduleId: "kn-seed-factory-stl-gemini-001",
    cardId: "FACTORY-STL-GEMINI-001",
    title:
      "【製造DX】方眼紙スケッチ✕Gemini Visionによる手書き図面からの即時STL生成",
    tags: [
      "#3Dプリンター",
      "#AI_Vision",
      "#GeminiAPI",
      "#手書き図面DX",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "方眼紙に手書きした2Dスケッチ・寸法文字をPWAカメラで認識し、",
      "Gemini Vision APIがOpenSCAD/3Dパラメータを抽出。",
      "ブラウザ上でThree.jsプレビュー後、ワンタップでSTLを出力して現場特化ブラケットを即時3Dプリント。",
    ].join("\n"),
    body: FACTORY_STL_BODY,
  },
];

export function getFactoryStlModuleSeedItemsV1(): FactoryStlModuleSeedItemV1[] {
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

export function getFactoryStlCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedFactoryStlKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getFactoryStlCardSeedInputsV1()) {
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
  const missingInIndex = FACTORY_STL_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
