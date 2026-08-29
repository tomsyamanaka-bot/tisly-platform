/**
 * 製造DX / 盤製造DX / 配線施工DX Part2（4件）
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

export interface FactoryDxPart2ModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const FACTORY_DX_PART2_MODULE_SEED_IDS = [
  "kn-seed-hybrid-sla-fdm-asm-001",
  "kn-seed-printer-push-strength-001",
  "kn-seed-insert-nut-cost-resin-001",
  "kn-seed-tywrap-terminal-mold-001",
] as const;

export const FACTORY_DX_PART2_CARD_IDS = [
  "FACTORY-HYBRID-SLA-FDM-ASM-001",
  "FACTORY-PRINTER-PUSH-STRENGTH-001",
  "FACTORY-INSERT-NUT-COST-RESIN-001",
  "FACTORY-TYWRAP-TERMINAL-MOLD-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T17:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type Def = {
  moduleId: (typeof FACTORY_DX_PART2_MODULE_SEED_IDS)[number];
  cardId: (typeof FACTORY_DX_PART2_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const ASM_BODY = [
  "【ハイブリッド出力】",
  "ELEGOO Saturn 4 Ultra（12K 光造形）で精密ギヤ・",
  "スキャンパーツを造形し、Creality K2 Plus（大型 FDM）",
  "で耐候性トラスフレームを造形する。",
  "",
  "【結合プレビュー】",
  "PWA 上で結合・分解（爆発図）を Three.js 表示。",
  "素材別色分けと結合クリアランスを自動調整する。",
  "",
  "【効果】",
  "異種プリンター混在製造を最適化し、現場筐体の",
  "強度と精度を両立する。",
].join("\n");

const PUSH_BODY = [
  "【稼働監視】",
  "事務所・車載 3D プリンターの完了・異常を",
  "PWA プッシュ通知で即時共有する。",
  "",
  "【積層強度 AI】",
  "ボルト締め・荷重方向から最適なビルド向き",
  "（Z 軸）を自動判定し、積層剥離割れを防ぐ。",
  "",
  "【現場効果】",
  "再プリント待ちと現場破損を削減する。",
].join("\n");

const INSERT_BODY = [
  "【熱圧入ポケット】",
  "真鍮インサートナット（M3/M4）用の熱圧入下穴を",
  "パラメトリック自動設計する。",
  "",
  "【原価試算】",
  "樹脂使用量（g）・原価・印刷時間をリアルタイム表示。",
  "",
  "【耐候ナビ】",
  "設置環境に応じ ASA / PETG / CF を自動選定する。",
].join("\n");

const TYWRAP_BODY = [
  "【タイラップアイ】",
  "ボックス底面・側面に結束バンド通し穴を自動配置し、",
  "機械振動による電線抜けを防止する。",
  "",
  "【立体モールド】",
  "天板・端子番号（DI/RO）を 3D プリント時に一体成形し、",
  "配線施工ミスをゼロ化する。",
  "",
  "【施工品質】",
  "白ベース×navy UI で現場でも番号確認しやすい。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-hybrid-sla-fdm-asm-001",
    cardId: "FACTORY-HYBRID-SLA-FDM-ASM-001",
    title:
      "【製造DX】光造形（Saturn 4 Ultra）✕ 大型FDM（K2 Plus）ハイブリッド出力＆結合アセンブリ設計",
    tags: [
      "#3Dプリンター",
      "#光造形",
      "#FDM",
      "#アセンブリ",
      "#Creality",
      "#ELEGOO",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "12K光造形の精密ギヤ・スキャンパーツと大型FDMの耐候性トラスフレームを",
      "PWA上で結合・分解（爆発図）プレビュー。",
      "素材別色分けと結合クリアランス自動調整で異種3Dプリンター混在製造を最適化。",
    ].join("\n"),
    body: ASM_BODY,
  },
  {
    moduleId: "kn-seed-printer-push-strength-001",
    cardId: "FACTORY-PRINTER-PUSH-STRENGTH-001",
    title:
      "【製造DX】3Dプリンター稼働監視・PWAプッシュ通知連動と積層強度AIガイド",
    tags: [
      "#3Dプリンター",
      "#PWA通知",
      "#積層強度",
      "#現場DX",
      "#TiSLY_Factory",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "事務所・車載3Dプリンターの出力完了・異常をPWAへ即時プッシュ通知。",
      "ボルト締め付け・荷重方向からAIが最適なビルド印刷向き（Z軸）を自動判定し、",
      "現場での積層剥離割れを防止。",
    ].join("\n"),
    body: PUSH_BODY,
  },
  {
    moduleId: "kn-seed-insert-nut-cost-resin-001",
    cardId: "FACTORY-INSERT-NUT-COST-RESIN-001",
    title:
      "【盤製造DX】インサートナット熱圧入ポケット・資材コスト試算・耐候性樹脂ナビ",
    tags: [
      "#インサートナット",
      "#原価計算",
      "#耐候性樹脂",
      "#3Dプリンター",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "真鍮インサートナット（M3/M4）用熱圧入下穴を自動設計。",
      "樹脂使用量（g）・原価・印刷時間をリアルタイム試算し、",
      "設置環境に応じた耐候性樹脂（ASA/PETG/CF）を自動選定。",
    ].join("\n"),
    body: INSERT_BODY,
  },
  {
    moduleId: "kn-seed-tywrap-terminal-mold-001",
    cardId: "FACTORY-TYWRAP-TERMINAL-MOLD-001",
    title:
      "【配線施工DX】インシュロック固定ブリッジ＆端子モールド一体成形設計",
    tags: [
      "#配線整理",
      "#結束バンド",
      "#立体モールド",
      "#施工品質",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "電気工事",
    category: "電気工事",
    summary: [
      "ボックス底面・側面に結束バンドを通すタイラップアイを自動配置し、",
      "機械振動による電線抜けを防止。",
      "3Dプリント時に天板・端子番号（DI/RO）を立体モールド成形し、配線施工ミスをゼロ化。",
    ].join("\n"),
    body: TYWRAP_BODY,
  },
];

export function getFactoryDxPart2ModuleSeedItemsV1(): FactoryDxPart2ModuleSeedItemV1[] {
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

export function getFactoryDxPart2CardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedFactoryDxPart2KnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getFactoryDxPart2CardSeedInputsV1()) {
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
  const missingInIndex = FACTORY_DX_PART2_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
