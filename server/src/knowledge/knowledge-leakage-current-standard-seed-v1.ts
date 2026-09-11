/**
 * 電技解釈 漏えい電流 1.0mA 基準ナレッジ
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

export interface LeakageCurrentStandardModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const LEAKAGE_CURRENT_STANDARD_MODULE_SEED_IDS = [
  "kn-seed-leakage-current-1ma-001",
] as const;

export const LEAKAGE_CURRENT_STANDARD_CARD_IDS = [
  "OPS-LEAKAGE-CURRENT-1MA-001",
] as const;

const SEED_CREATED_AT = "2026-09-11T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-11";

const TITLE =
  "【電工基準・電技解釈】漏えい電流の判定基準（1.0mA以下合格・活線メガ測定代替）";

const TAGS = [
  "#電技解釈",
  "#漏えい電流",
  "#リーククランプ",
  "#活線測定",
  "#絶縁管理",
  "#電工DX",
  "#TiSLY_Core",
];

const SUMMARY = [
  "電技解釈第14条：絶縁抵抗測定が困難な場合、漏えい電流1.0mA以下で絶縁性能保持とみなす。",
  "1.0mA「以下」は合格（セーフ）、1.0mA「超（より上）」は不合格（アウト・要改修）。",
  "サーバー室や病院・稼働中工場など、停電不可ラインのクランプ測定・常時監視の絶対基準。",
].join("");

const BODY = [
  "【根拠】",
  "電気設備の技術基準（電技解釈 第14条）の絶縁性能規定。",
  "通常は停電して絶縁抵抗計（メガー）で",
  "0.1MΩ / 0.2MΩ / 0.4MΩ 以上を確認する。",
  "",
  "【活線代替】",
  "無停電現場ではリーククランプテスターを用いる。",
  "電線束（単相は2本一括、三相は3本一括）を挟み、",
  "漏えい電流（Io）を測定する。",
  "",
  "【合否ライン】",
  "・1.0 mA 以下：合格（絶縁性能良好・継続使用可）",
  "・1.0 mA より上：不合格（絶縁劣化・微小漏電・要回路切り分け調査）",
  "",
  "【注意】",
  "インバーター機器の高周波成分（Ior vs Ioc）で誤検知しやすい。",
  "TiSLY の CT 電流監視・漏電予兆アラートは、",
  "本しきい値を判定設計の基礎規格とする。",
].join("\n");

type Def = {
  moduleId: (typeof LEAKAGE_CURRENT_STANDARD_MODULE_SEED_IDS)[number];
  cardId: (typeof LEAKAGE_CURRENT_STANDARD_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-leakage-current-1ma-001",
    cardId: "OPS-LEAKAGE-CURRENT-1MA-001",
    title: TITLE,
    tags: TAGS,
    genre: "電気工事",
    category: "電気工事",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getLeakageCurrentStandardModuleSeedItemsV1(): LeakageCurrentStandardModuleSeedItemV1[] {
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

export function getLeakageCurrentStandardCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedLeakageCurrentStandardKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getLeakageCurrentStandardCardSeedInputsV1()) {
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
  const missing = LEAKAGE_CURRENT_STANDARD_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
