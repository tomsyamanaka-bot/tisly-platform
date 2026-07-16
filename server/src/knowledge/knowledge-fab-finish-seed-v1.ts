/**
 * 手作り品を工業製品レベルに見せる
 * 滑らか加工・仕上げノウハウ（初期シード）
 */

import type { KnowledgeCardInputV1, KnowledgeCardV1 } from "./knowledge-types.js";
import {
  getKnowledgeCardV1,
  loadKnowledgeSearchIndexV1,
  rebuildKnowledgeSearchIndexV1,
  saveKnowledgeCardV1,
} from "./knowledge-store-v1.js";

/** module-items.json 向けシード行（循環 import 回避） */
export interface FabFinishModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

/** モジュール用の安定 ID（再デプロイで上書き更新） */
export const FAB_FINISH_MODULE_SEED_IDS = [
  "kn-seed-fab-putty-sand-001",
  "kn-seed-fab-primer-matte-001",
  "kn-seed-fab-acrylic-weld-001",
  "kn-seed-fab-belt-skive-001",
] as const;

/** Knowledge Card 用 ID（検索インデックス連携） */
export const FAB_FINISH_CARD_IDS = [
  "FAB-PUTTY-SAND-001",
  "FAB-PRIMER-MATTE-001",
  "FAB-ACRYLIC-WELD-001",
  "FAB-BELT-SKIVE-001",
] as const;

const SEED_CREATED_AT = "2026-07-16T00:00:00.000Z";
const SEED_UPDATED_AT = "2026-07-16";

type FabFinishSeedDef = {
  moduleId: (typeof FAB_FINISH_MODULE_SEED_IDS)[number];
  cardId: (typeof FAB_FINISH_CARD_IDS)[number];
  title: string;
  tags: string[];
  summaryLines: [string, string, string];
  genre: string;
};

/**
 * ブレスト決定の仕上げノウハウ 4 件。
 * summary は 3 行要約（改行結合）。
 */
const FAB_FINISH_DEFS: FabFinishSeedDef[] = [
  {
    moduleId: "kn-seed-fab-putty-sand-001",
    cardId: "FAB-PUTTY-SAND-001",
    title: "パテ盛り＋サンディングによる段差・継ぎ目消し技術",
    tags: ["製作ノウハウ", "デモ機加工", "仕上げ"],
    genre: "プラント",
    summaryLines: [
      "異なるパーツの接続部にエポキシパテをヘラで盛り付ける。",
      "完全乾燥後、紙ヤスリ（#180➔#400➔#800）で指で触って段差が消えるまで削る。",
      "これで別々のパーツを、金型から抜いた一体成型のような見た目に昇華。",
    ],
  },
  {
    moduleId: "kn-seed-fab-primer-matte-001",
    cardId: "FAB-PRIMER-MATTE-001",
    title: "プラサフ（下地）とマット塗装による工業POM質感仕上げ",
    tags: ["製作ノウハウ", "塗装", "仕上げ"],
    genre: "プラント",
    summaryLines: [
      "削りキズやプラ・ゴムの微細な巣穴を「プラサフ」スプレーで埋めて下地を作る。",
      "乾燥後、#1000のヤスリで水研ぎして赤ちゃんの肌のようなツルツルにする。",
      "仕上げにマットブラック（艶消し黒）を吹くことで、高級な削り出しプラスチックの質感を再現。",
    ],
  },
  {
    moduleId: "kn-seed-fab-acrylic-weld-001",
    cardId: "FAB-ACRYLIC-WELD-001",
    title: "溶剤接着（溶着）によるシームレスアクリル配管",
    tags: ["製作ノウハウ", "サイロ", "プラント"],
    genre: "プラント",
    summaryLines: [
      "アクリル管と漏斗の接着に接着剤を使わず、アクリル用溶剤（二塩化メチレン等）を使用。",
      "素材同士を化学反応で溶かして完全に「一体化（溶着）」させる。",
      "はみ出し跡を削り落とすことで、ボンド跡のない美しいシームレスパイプが完成する。",
    ],
  },
  {
    moduleId: "kn-seed-fab-belt-skive-001",
    cardId: "FAB-BELT-SKIVE-001",
    title: "ゴムベルトの斜めカット（スカイブ接合）による静音駆動",
    tags: ["製作ノウハウ", "コンベア", "ゴムベルト"],
    genre: "プラント",
    summaryLines: [
      "ゴムシートを垂直に切るのではなく、端を30度の角度で「くさび形」に斜めスライスする。",
      "重ね合わせた時の厚みが元の1枚分（5mm等）になるよう、ゴム用瞬間接着剤でガチ圧着。",
      "継ぎ目をヤスリで滑らかに仕上げることで、ローラーを通る際の引っかかりやガタガタ音をゼロにする。",
    ],
  },
];

function joinSummary(lines: [string, string, string]): string {
  return lines.join("\n");
}

/** Knowledge Module（カード UI）向けシード */
export function getFabFinishModuleSeedItemsV1(): FabFinishModuleSeedItemV1[] {
  return FAB_FINISH_DEFS.map((d) => ({
    id: d.moduleId,
    title: d.title,
    summary: joinSummary(d.summaryLines),
    genre: d.genre,
    tags: [...d.tags],
    pdf_url: null,
    createdAt: SEED_CREATED_AT,
  }));
}

/** Knowledge Cards（統合検索）向け入力 */
export function getFabFinishCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return FAB_FINISH_DEFS.map((d) => ({
    id: d.cardId,
    title: d.title,
    category: "その他",
    tags: [...d.tags],
    summary: joinSummary(d.summaryLines),
    files: [],
    updatedAt: SEED_UPDATED_AT,
    sourceType: "manual" as const,
    qnapSyncStatus: "pending" as const,
  }));
}

/**
 * Knowledge Cards へ仕上げノウハウを upsert。
 * 未登録のみ作成し、内容差があれば上書きする。
 * 検索インデックスに欠けていれば再生成する。
 */
export function seedFabFinishKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getFabFinishCardSeedInputsV1()) {
    const existing = getKnowledgeCardV1(input.id!);
    if (
      existing &&
      existing.title === input.title &&
      existing.summary === input.summary &&
      JSON.stringify(existing.tags) === JSON.stringify(input.tags)
    ) {
      continue;
    }
    created.push(
      saveKnowledgeCardV1(input, { skipQnapQueue: true })
    );
  }

  const index = loadKnowledgeSearchIndexV1();
  const indexed = new Set(index.entries.map((e) => e.id));
  const missingInIndex = FAB_FINISH_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
