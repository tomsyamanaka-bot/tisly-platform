/**
 * 8x8 Matrix LiDAR のヒートマップと物理マスク。
 * 既存カードは消さず、末尾に足す。
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

export interface MatrixLidarHeatmapModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const MATRIX_LIDAR_HEATMAP_MODULE_SEED_IDS = [
  "kn-seed-matrix-lidar-heatmap-001",
] as const;

export const MATRIX_LIDAR_HEATMAP_CARD_IDS = [
  "OPS-MATRIX-LIDAR-HEATMAP-001",
] as const;

const SEED_CREATED_AT = "2026-11-01T09:10:00.000Z";
const SEED_UPDATED_AT = "2026-11-01";

const TITLE =
  "【センサーハック】8x8 Matrix LiDAR（VL53L5CX）のPWAヒートマップ化と物理エリア調整";

const TAGS = ["#LiDAR", "#UART", "#ヒートマップ", "#エリア調整", "#RP2350"];

const SUMMARY = [
  "空間を8x8（64分割）で見る LiDAR は、UART の TX/RX を交差してつなぐ。",
  "アルミテープは乱反射で誤報になるため使わず、つや消し黒で画角を物理的に絞る。",
  "PWA のヒートマップを見ながら、反応しているマスへテープを足す。",
].join("");

const BODY = [
  "【センサー】",
  "DFRobot SEN0628（VL53L5CX 系の 8x8 Matrix LiDAR）。",
  "距離はミリメートル。64マスをソフトウェアで無効化したり、遠いマスを切ったりしない。",
  "",
  "【UART】",
  "ボーレートは 115200。",
  "板橋の RP2350 は UART1。ホスト TX は GPIO4、ホスト RX は GPIO5。",
  "センサーの R はホストの TX、センサーの T はホストの RX（クロス）。",
  "DIP は UART にしてから電源を入れ直す。",
  "DI（GPIO9–16）と DO（GPIO17–24）には載せない。",
  "",
  "【ヒートマップ】",
  "社内 /app/security とお客様 /customer の警備画面に、板橋のときだけ 8×8 を出す。",
  "近いマスはネイビーかオレンジ、遠いマスは白か薄いグレー。",
  "現場ではスマホを見ながら、今反応しているマスを確認する。",
  "",
  "【物理エリア調整】",
  "アルミテープは光が乱反射し、人がいないマスまで近く見える。使わない。",
  "画角から外したい範囲は、つや消し黒（パーマセルテープなど）をセンサーの縁に貼る。",
  "ヒートマップでそのマスが白に寄ったことを確認してから、次のマスを足す。",
].join("\n");

type Def = {
  moduleId: (typeof MATRIX_LIDAR_HEATMAP_MODULE_SEED_IDS)[number];
  cardId: (typeof MATRIX_LIDAR_HEATMAP_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-matrix-lidar-heatmap-001",
    cardId: "OPS-MATRIX-LIDAR-HEATMAP-001",
    title: TITLE,
    tags: TAGS,
    genre: "IOT関連",
    category: "IOT関連",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getMatrixLidarHeatmapModuleSeedItemsV1(): MatrixLidarHeatmapModuleSeedItemV1[] {
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

export function getMatrixLidarHeatmapCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedMatrixLidarHeatmapKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getMatrixLidarHeatmapCardSeedInputsV1()) {
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
  const missing = MATRIX_LIDAR_HEATMAP_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
