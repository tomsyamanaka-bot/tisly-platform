/**
 * ホームセキュリティ施工ナレッジ追記
 * （フロア俯瞰・防虫塗装・ガス接点・格安SIM）
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

export interface SecurityFloorModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const SECURITY_FLOOR_MODULE_SEED_IDS = [
  "kn-seed-sec-floor-mmwave-001",
  "kn-seed-sec-flood-yellow-001",
  "kn-seed-sec-gas-pulse-001",
  "kn-seed-sec-sim-watch-001",
] as const;

export const SECURITY_FLOOR_CARD_IDS = [
  "SEC-FLOOR-MMWAVE-001",
  "SEC-FLOOD-YELLOW-001",
  "SEC-GAS-PULSE-001",
  "SEC-SIM-WATCH-001",
] as const;

const SEED_CREATED_AT = "2026-08-19T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-19";

type SecurityFloorSeedDef = {
  moduleId: (typeof SECURITY_FLOOR_MODULE_SEED_IDS)[number];
  cardId: (typeof SECURITY_FLOOR_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const MMWAVE_BODY = [
  "【機器と仕込み位置】",
  "HLK-LD2410B をビーマー内部、または",
  "露出ボックスの奥に収める。レンズ面は",
  "人の動線に向け、金属カバーで電波を",
  "遮らない。",
  "",
  "【RP2350 DI 直結】",
  "LD2410B の OUT（人検知）を",
  "RP2350 の DI へ 2 芯弱電で直結する。",
  "プルアップと 50ms デバウンスを入れる。",
  "電源は 5V 安定化、GND 共通化を徹底。",
  "",
  "【フロアマップ発光】",
  "DI ON をテレメトリで送り、該当部屋を",
  "赤色パルス発光させる。間取り座標は",
  "物件ごとのセンサーマッピングで持つ。",
].join("\n");

const YELLOW_BODY = [
  "【目的】",
  "投光器 6500K は誘虫波長（紫外〜青）が",
  "強く、虫がレンズに集まりカメラ誤作動の",
  "原因になる。",
  "",
  "【塗装ハック】",
  "ダイヤワイト等の透過型クリアイエローを",
  "レンズカバーへ薄く塗装する。照度は残し、",
  "誘虫帯域だけをカットする。",
  "",
  "【現場注意】",
  "厚塗りは光量が落ちる。2 回薄塗りを基本。",
  "防水パッキンを塗装で塞がない。",
].join("\n");

const GAS_BODY = [
  "【接点取り出し】",
  "ガスメーターのパルス（DT/SG）接点から",
  "RP2350 DI へ 2 芯弱電線を直結する。",
  "計量法とガス事業者の工事範囲を確認。",
  "",
  "【見守り連携】",
  "パルス積算で自動検針。24 時間ガス未検知",
  "は生活見守りアラート。感震遮断は",
  "ケイホウ接点を別 DI で即時通知する。",
  "",
  "【PWA】",
  "発報はホームセキュリティ俯瞰と",
  "ガス見守り画面へ同時に反映する。",
].join("\n");

const SIM_BODY = [
  "【通信設計】",
  "格安 SIM 月 1〜3GB を前提に設計する。",
  "センサーログと接点はテキストで常時送信。",
  "",
  "【カメラ】",
  "常時ストリーミングはしない。",
  "イベント発動時またはオンデマンドのみ",
  "映像を送る。",
  "",
  "【効果】",
  "月額通信費を最小化しつつ、",
  "遠隔監視とホームセキュリティを両立する。",
].join("\n");

const DEFS: SecurityFloorSeedDef[] = [
  {
    moduleId: "kn-seed-sec-floor-mmwave-001",
    cardId: "SEC-FLOOR-MMWAVE-001",
    title:
      "【防犯・セキュリティ】フロア俯瞰図連動とミリ波レーダー（HLK-LD2410B）のDI直結施工",
    tags: [
      "防犯",
      "ミリ波",
      "RP2350",
      "施工方法",
      "IOT関連",
    ],
    genre: "セキュリティー",
    category: "防犯カメラ",
    summary:
      "ビーマーや露出ボックス内にHLK-LD2410Bを仕込み、RP2350のDIへ直結。フロアマップ上でリアルタイムに該当エリアを発光させる配線手法。",
    body: MMWAVE_BODY,
  },
  {
    moduleId: "kn-seed-sec-flood-yellow-001",
    cardId: "SEC-FLOOD-YELLOW-001",
    title:
      "【照明・害虫対策】投光器6500Kの防虫クリアイエロー塗装ハック",
    tags: ["照明", "害虫", "カメラ", "アイデア"],
    genre: "防犯カメラ",
    category: "防犯カメラ",
    summary:
      "ダイヤワイト等の「透過型クリアイエロー」をレンズカバーに塗装し、誘虫波長（紫外線〜青色）をカットしてカメラ誤作動と虫害を防ぐ手法。",
    body: YELLOW_BODY,
  },
  {
    moduleId: "kn-seed-sec-gas-pulse-001",
    cardId: "SEC-GAS-PULSE-001",
    title:
      "【住設ハック】ガスメーターパルス（DT/SG）＆ケイホウ直結による24時間見守り",
    tags: [
      "ガス",
      "見守り",
      "RP2350",
      "施工方法",
      "IOT関連",
    ],
    genre: "IOT関連",
    category: "IOT関連",
    summary:
      "ガスメーターの接点からRP2350へ2芯弱電線を直結し、自動検針・24時間ガス未検知アラート・地震自動遮断通知をPWAへ即時連携させる仕組み。",
    body: GAS_BODY,
  },
  {
    moduleId: "kn-seed-sec-sim-watch-001",
    cardId: "SEC-SIM-WATCH-001",
    title:
      "【通信設計】格安SIM（月1〜3GB）での低コスト遠隔監視・ホームセキュリティ運用",
    tags: ["通信", "SIM", "監視", "IOT関連"],
    genre: "ネットワーク",
    category: "ネットワーク",
    summary:
      "センサーログや接点信号はテキスト（軽量）で常時通信し、カメラはオンデマンド/イベント発動時のみ送信することで月額通信費を最小化する設計。",
    body: SIM_BODY,
  },
];

export function getSecurityFloorModuleSeedItemsV1(): SecurityFloorModuleSeedItemV1[] {
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

export function getSecurityFloorCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedSecurityFloorKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getSecurityFloorCardSeedInputsV1()) {
    const existing = getKnowledgeCardV1(input.id!);
    if (
      existing &&
      existing.title === input.title &&
      existing.summary === input.summary &&
      existing.body === input.body &&
      JSON.stringify(existing.tags) ===
        JSON.stringify(input.tags)
    ) {
      continue;
    }
    created.push(
      saveKnowledgeCardV1(input, { skipQnapQueue: true })
    );
  }

  const index = loadKnowledgeSearchIndexV1();
  const indexed = new Set(index.entries.map((e) => e.id));
  const missingInIndex = SECURITY_FLOOR_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
