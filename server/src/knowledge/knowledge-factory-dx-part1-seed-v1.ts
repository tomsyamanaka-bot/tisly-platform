/**
 * 製造DX / 保守DX Part1 ナレッジ（3件）
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

export interface FactoryDxPart1ModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const FACTORY_DX_PART1_MODULE_SEED_IDS = [
  "kn-seed-revopoint-hybrid-viewer-001",
  "kn-seed-3d-param-number-delta-ui-001",
  "kn-seed-qr-ar-reprint-001",
] as const;

export const FACTORY_DX_PART1_CARD_IDS = [
  "FACTORY-REVOPOINT-HYBRID-VIEWER-001",
  "FACTORY-3D-PARAM-NUMBER-DELTA-UI-001",
  "FACTORY-QR-AR-REPRINT-001",
] as const;

const SEED_CREATED_AT = "2026-08-29T16:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-29";

type FactoryDxPart1SeedDef = {
  moduleId: (typeof FACTORY_DX_PART1_MODULE_SEED_IDS)[number];
  cardId: (typeof FACTORY_DX_PART1_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const VIEWER_BODY = [
  "【一元ビューアー】",
  "Revopoint MINI 2（0.02mm 級）スキャンと方眼紙 AI",
  "生成データを Three.js で同一 PWA に載せる。",
  "白ベース×navy で現場でも寸法確認できる。",
  "",
  "【3 層保存】",
  "IndexedDB（オフライン）· ConoHa VPS（メタ共有）·",
  "社内 QNAP NAS（大容量マスター）で超高速運用する。",
  "",
  "【効果】",
  "回線コストを抑えつつ、現場プレビューと事務所保管を両立。",
].join("\n");

const DELTA_UI_BODY = [
  "【丸数字バッジ】",
  "幅／高さ／穴径／ピッチに ①②③… を自動付与し、",
  "番号指定でスライダー・音声・テキスト差分を操作する。",
  "",
  "【リアルタイム再計算】",
  "赤ペン再撮影を含む差分入力で寸法を即再計算し、",
  "STL を再出力する。現物合わせを爆速化する。",
  "",
  "【UI】",
  "大きなタップ領域と高コントラストで屋外でも迷わない。",
].join("\n");

const QR_AR_BODY = [
  "【QR 直結】",
  "3D プリント筐体に刻印した QR から PWA の STL 画面を",
  "ダイレクト起動する。ログイン後ワンタップで再出力。",
  "",
  "【AR 干渉チェック】",
  "WebXR / AR で現場原寸の重ね合わせ確認を行い、",
  "干渉・クリアランスをその場で判定する。",
  "",
  "【保守効果】",
  "遠隔 3D プリント連携で手戻りをゼロ化し、月額保守の",
  "再製作リードタイムを短縮する。",
].join("\n");

const DEFS: FactoryDxPart1SeedDef[] = [
  {
    moduleId: "kn-seed-revopoint-hybrid-viewer-001",
    cardId: "FACTORY-REVOPOINT-HYBRID-VIEWER-001",
    title:
      "【製造DX】Revopoint MINI 2連携・PWA 3DビューアーとQNAP/IndexedDBハイブリッド保存",
    tags: [
      "#Revopoint",
      "#3Dスキャナー",
      "#QNAP",
      "#IndexedDB",
      "#ThreeJS",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "0.02mm精度の3Dスキャンデータや方眼紙AIデータをThree.jsで一元管理。",
      "端末内IndexedDB（オフライン）、ConoHa VPS（メタ共有）、",
      "社内QNAP NAS（大容量マスター保管）の3層保存で超高速運用。",
    ].join("\n"),
    body: VIEWER_BODY,
  },
  {
    moduleId: "kn-seed-3d-param-number-delta-ui-001",
    cardId: "FACTORY-3D-PARAM-NUMBER-DELTA-UI-001",
    title:
      "【製造DX】3Dパラメトリック寸法ナンバリング＆現場リアルタイム差分更新UI",
    tags: [
      "#3Dプリンター",
      "#パラメトリック設計",
      "#ナンバリング",
      "#寸法調整",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "3Dモデルの変更可能箇所（幅/高さ/穴径/ピッチ）に「①, ②, ③...」の丸数字バッジを自動付与。",
      "スライダー操作・音声/テキスト差分・赤ペン再撮影で",
      "即座に寸法を再計算・再出力する高速UI。",
    ].join("\n"),
    body: DELTA_UI_BODY,
  },
  {
    moduleId: "kn-seed-qr-ar-reprint-001",
    cardId: "FACTORY-QR-AR-REPRINT-001",
    title:
      "【保守DX】QRコード直結によるパーツ即時再出力と現場AR原寸重ね合わせ干渉チェック",
    tags: [
      "#3Dプリンター",
      "#QR連動",
      "#AR干渉チェック",
      "#保守DX",
      "#TiSLY_Factory",
      "#PWA",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "3Dプリント筐体に刻印したQRからPWAのSTL画面をダイレクト起動。",
      "WebXR/ARによる現場原寸重ね合わせ確認と",
      "ワンタップ遠隔3Dプリントで保守手戻りをゼロ化。",
    ].join("\n"),
    body: QR_AR_BODY,
  },
];

export function getFactoryDxPart1ModuleSeedItemsV1(): FactoryDxPart1ModuleSeedItemV1[] {
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

export function getFactoryDxPart1CardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedFactoryDxPart1KnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getFactoryDxPart1CardSeedInputsV1()) {
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
  const missingInIndex = FACTORY_DX_PART1_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
