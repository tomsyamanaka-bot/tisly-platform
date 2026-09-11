/**
 * ハードウェアキッティング＆サージ保護ナレッジ
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

export interface HwKittingSurgeModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const HW_KITTING_SURGE_MODULE_SEED_IDS = [
  "kn-seed-cr-surge-rp2350-001",
  "kn-seed-rs485-term-vs-cr-001",
  "kn-seed-rp2350-kitting-4step-001",
] as const;

export const HW_KITTING_SURGE_CARD_IDS = [
  "OPS-CR-SURGE-RP2350-001",
  "OPS-RS485-TERM-VS-CR-001",
  "OPS-RP2350-KITTING-4STEP-001",
] as const;

const SEED_CREATED_AT = "2026-09-11T11:40:00.000Z";
const SEED_UPDATED_AT = "2026-09-11";

type Def = {
  moduleId: (typeof HW_KITTING_SURGE_MODULE_SEED_IDS)[number];
  cardId: (typeof HW_KITTING_SURGE_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-cr-surge-rp2350-001",
    cardId: "OPS-CR-SURGE-RP2350-001",
    title:
      "【回路保護・電工】CRサージアブソーバーによるRP2350リレー接点保護とマイコン暴走防止",
    tags: [
      "#サージ対策",
      "#CRアブソーバー",
      "#リレー保護",
      "#電工DX",
      "#RP2350",
      "#TiSLY_Core",
    ],
    genre: "電気工事",
    category: "電気工事",
    summary: [
      "誘導性負荷（モーター・電磁弁・投光器）遮断時の逆起電力アークを吸収。",
      "ルビコン製250MCRA333120M（0.033μF＋120Ω / AC250V）をCOM-NO端子間に並列挿入。",
      "接点溶着の防止および高電圧スパークノイズによるマイコンフリーズを物理遮断。",
    ].join(""),
    body: [
      "【目的】",
      "リレー開閉時に発生する数千ボルトの逆起電力スパークを吸収し、",
      "接点溶着とマイコン暴走を防ぐ。",
      "",
      "【原理】",
      "直列コンデンサが商用周波数電流をカットしつつ、",
      "高周波ノイズのみを抵抗で熱変換して消費する。",
      "",
      "【標準部材】",
      "ルビコン 250MCRA333120M",
      "0.033μF ＋ 120Ω / AC250V。",
      "COM-NO 端子間へ並列挿入する。",
      "",
      "【効果】",
      "1個数十円の部品で産業クラスの耐久性を確保する。",
      "投光器・電磁弁・モーター負荷の配線標準とする。",
    ].join("\n"),
  },
  {
    moduleId: "kn-seed-rs485-term-vs-cr-001",
    cardId: "OPS-RS485-TERM-VS-CR-001",
    title:
      "【通信設計】RS485終端抵抗（純120Ω）とCRサージアブソーバーの使い分け基準",
    tags: [
      "#RS485",
      "#終端抵抗",
      "#Modbus",
      "#信号品質",
      "#誤配線防止",
      "#TiSLY_Core",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "「同じ120Ω」表記でもCRアブソーバーをRS485通信線（A/B間）に使うのは厳禁。",
      "コンデンサ容量成分が高周波の通信パルス波形を丸めて文字化け・通信死を誘発。",
      "RS485バス末端には純粋な1/4W 120Ωカーボン抵抗、または機器内蔵スイッチを採用。",
    ].join(""),
    body: [
      "【物理】",
      "差動通信ラインは特性インピーダンス整合で反射波を抑える。",
      "終端は純抵抗のみが正しい。",
      "",
      "【役割の違い】",
      "リレーノイズ対策のCR素子は C 直列で高周波を熱変換する。",
      "伝送路終端は純 R でバスを 120Ω に合わせる。",
      "",
      "【厳禁】",
      "CRアブソーバーを A/B 間へ入れない。",
      "波形が丸まり文字化け・通信死を起こす。",
      "",
      "【キッティング】",
      "部材袋を「リレー保護CR」と「RS485終端R」で分ける。",
      "現場での混同をデスク上で防ぐ。",
    ].join("\n"),
  },
  {
    moduleId: "kn-seed-rp2350-kitting-4step-001",
    cardId: "OPS-RP2350-KITTING-4STEP-001",
    title: "【量産・出荷】RP2350実機出荷前キッティング4大標準ワークフロー",
    tags: [
      "#出荷検査",
      "#キッティング",
      "#RGB自己診断",
      "#フォールバックIP",
      "#テプラ",
      "#TiSLY_Core",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "①RGBインジケーター（赤:異常 ➔ 青:設定済 ➔ 緑点滅:VPS疎通・OTA・出荷OK）。",
      "②天面テプララベル（物件名・端末ID・DI/DOアサイン）とPWA直結QRコード貼付。",
      "③現場光回線未開通時でも直結調査できるDHCPタイムアウト時予備固定IP機能。",
      "④RS485 Slave ID事前焼付けと最遠端終端処理、サージ保護素子の同梱。",
    ].join(""),
    body: [
      "【目的】",
      "現場駆けつけ不要の完全自立運用を実現する事前セットアップ。",
      "脚立上の配線迷いやネット不通をゼロにする。",
      "",
      "【① RGB自己診断】",
      "赤: 未設定または異常。",
      "青: 設定済・疎通待ち。",
      "緑点滅: VPS疎通・OTA・出荷OK。",
      "",
      "【② ラベルとQR】",
      "天面テプラに物件名・端末ID・DI/DO割当を印字。",
      "PWA直結QRを同面へ貼付する。",
      "",
      "【③ 予備固定IP】",
      "DHCPタイムアウト時は現場直結調査用の固定IPへ切替。",
      "光回線未開通でもキッティング確認ができる。",
      "",
      "【④ 通信と保護】",
      "RS485 Slave ID を事前焼付けし、最遠端を純120Ωで終端。",
      "サージ保護素子（CR）を同梱して出荷する。",
      "",
      "【引き渡し】",
      "現場到着後10分で引き渡し完了を量産出荷基準とする。",
    ].join("\n"),
  },
];

export function getHwKittingSurgeModuleSeedItemsV1(): HwKittingSurgeModuleSeedItemV1[] {
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

export function getHwKittingSurgeCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedHwKittingSurgeKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getHwKittingSurgeCardSeedInputsV1()) {
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
  const missing = HW_KITTING_SURGE_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
