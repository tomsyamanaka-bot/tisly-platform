/**
 * UI/UX 標準デザインガイドライン
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

export interface UiuxDesignStandardModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const UIUX_DESIGN_STANDARD_MODULE_SEED_IDS = [
  "kn-seed-uiux-design-standard-001",
] as const;

export const UIUX_DESIGN_STANDARD_CARD_IDS = [
  "OPS-UIUX-DESIGN-STANDARD-001",
] as const;

const SEED_CREATED_AT = "2026-11-01T00:00:00.000Z";
const SEED_UPDATED_AT = "2026-11-01";

const TITLE =
  "【UI/UX標準】TiSLY プロフェッショナルデザインガイドラインとデグレ防止ルール";

const TAGS = [
  "#UIUX",
  "#デザイン標準",
  "#デグレ防止",
  "#白ベースNavy",
  "#TiSLY_Core",
];

const SUMMARY = [
  "現場の職人や高齢の施主でも直感的に操作できるよう、UIは「白ベース×Navy（紺色）アクセント」を厳守。",
  "ボタンは角丸（Rounded）で大きく押しやすいフルカラーデザインとし、",
  "フラットすぎる無色ボタンやショボいUIへの先祖返り（デグレ）を固く禁じる。",
].join("");

const BODY = [
  "【配色】",
  "背景は白（#ffffff〜#F8FAFC）。",
  "アクセントはネイビー #1E3A8A。",
  "文字は #0F172A。",
  "",
  "【ボタン】",
  "現場で押せる大きさ（目安 56px 以上）にする。",
  "主要操作は塗りつぶし。",
  "通常の実行はネイビー、安全・ON・点灯は緑 #16a34a、",
  "消灯・待機はグレー、警告・威嚇は赤またはオレンジ。",
  "文字は白でコントラストを取る。",
  "角は 12〜16px 程度。",
  "主要操作を無色や枠線だけのボタンに戻さない。",
  "",
  "【カード】",
  "関連情報は白カードにまとめ、ネイビーの細い枠と余白を付ける。",
  "",
  "【デグレ防止】",
  "既存の物件セレクト、ナビ、色クラスを、指示がない限り消さない。",
  "社内入口は /app、お客様入口は /customer のまま。",
  "プロの IoT ダッシュボードの見た目を保つ。",
].join("\n");

type Def = {
  moduleId: (typeof UIUX_DESIGN_STANDARD_MODULE_SEED_IDS)[number];
  cardId: (typeof UIUX_DESIGN_STANDARD_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-uiux-design-standard-001",
    cardId: "OPS-UIUX-DESIGN-STANDARD-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getUiuxDesignStandardModuleSeedItemsV1(): UiuxDesignStandardModuleSeedItemV1[] {
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

export function getUiuxDesignStandardCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedUiuxDesignStandardKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getUiuxDesignStandardCardSeedInputsV1()) {
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
  const missing = UIUX_DESIGN_STANDARD_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
