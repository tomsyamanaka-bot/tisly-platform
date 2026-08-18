/**
 * 価格・原価マスター初期データ。
 * 既存マスター・見積データは1文字も改変せず、
 * 本ファイルへ新規シードとして定義する。
 */

import type { PriceCostMasterItemSeedV1 } from "./price-cost-master-types-v1.js";
import {
  PRICE_COST_MASTER_GENRE_LABOR_SEED_V1,
  PRICE_COST_MASTER_GENRE_PARTS_SEED_V1,
} from "./price-cost-master-genre-seed-v1.js";

export const PRICE_COST_MASTER_TAB_LABELS_V1 = {
  parts: "材料・パーツ原価",
  subscription: "月額サブスクプラン",
  labor: "標準工事・作業単価",
} as const;

/** 材料・パーツ（Eco-Water / 制御） */
export const PRICE_COST_MASTER_PARTS_SEED_V1: PriceCostMasterItemSeedV1[] =
  [
    {
      id: "PCM-PART-PH-TX-001",
      kind: "parts",
      category: "水質センサー",
      name: "RS485出力 水質pHトランスミッター",
      costPrice: 18436,
      sellPrice: 32000,
      unitLabel: "台",
      notes: "Modbus-RTU / 4-20mA 併用可",
      tags: ["Eco-Water", "RS485", "pH"],
    },
    {
      id: "PCM-PART-PH-ELECTRODE-001",
      kind: "parts",
      category: "水質センサー",
      name: "BNCコネクタ式 交換用pHガラス電極",
      costPrice: 3500,
      sellPrice: 8000,
      unitLabel: "本",
      notes: "年1回交換のサブスク部材",
      tags: ["Eco-Water", "電極", "保守"],
    },
    {
      id: "PCM-PART-RP2350-RS485-001",
      kind: "parts",
      category: "制御ボード",
      name: "Waveshare RP2350 RS485制御ボード",
      costPrice: 4500,
      sellPrice: 12000,
      unitLabel: "枚",
      notes: "PoE / 8DI-8RO 現場盤向け",
      tags: ["RP2350", "RS485", "IoT"],
    },
    {
      id: "PCM-PART-IP65-BOX-001",
      kind: "parts",
      category: "筐体・防水",
      name: "屋外用IP65防水制御ボックス",
      costPrice: 2800,
      sellPrice: 6500,
      unitLabel: "台",
      notes: "センサー盤・現場キャビネット",
      tags: ["IP65", "盤", "屋外"],
    },
  ];

/** 月額サブスク（Eco-Water） */
export const PRICE_COST_MASTER_SUBS_SEED_V1: PriceCostMasterItemSeedV1[] =
  [
    {
      id: "PCM-SUB-EW-LITE-001",
      kind: "subscription",
      category: "Eco-Water",
      name: "エコウォーター遠隔監視 ライト",
      costPrice: 500,
      sellPrice: 3300,
      profitAmount: 2800,
      unitLabel: "月",
      notes: "遠隔pH監視・アラート",
      tags: ["Eco-Water", "監視", "ライト"],
    },
    {
      id: "PCM-SUB-EW-STD-001",
      kind: "subscription",
      category: "Eco-Water",
      name:
        "エコウォーター標準保守パッケージ" +
        "（年1回電極交換・遠隔アラート込）",
      costPrice: 1900,
      sellPrice: 7700,
      profitAmount: 5800,
      unitLabel: "月",
      notes: "電極交換1回/年 + 遠隔アラート",
      tags: ["Eco-Water", "保守", "電極交換"],
    },
  ];

/** 標準工事・作業単価（原価は人工により変動） */
export const PRICE_COST_MASTER_LABOR_SEED_V1: PriceCostMasterItemSeedV1[] =
  [
    {
      id: "PCM-LAB-SENSOR-PANEL-001",
      kind: "labor",
      category: "電気工事",
      name: "センサー盤設置・電源配線工事",
      costPrice: null,
      sellPrice: 35000,
      unitLabel: "式",
      notes: "標準売価。人工により原価変動",
      tags: ["設置", "電源", "盤"],
    },
    {
      id: "PCM-LAB-VP-SLEEVE-001",
      kind: "labor",
      category: "配管工事",
      name: "サンプリング配管・VP管スリーブ施工",
      costPrice: null,
      sellPrice: 25000,
      unitLabel: "式",
      notes: "浸漬設置・VPスリーブ標準",
      tags: ["配管", "VP管", "浸漬"],
    },
    {
      id: "PCM-LAB-CAL-COMMISSION-001",
      kind: "labor",
      category: "試運転・校正",
      name: "現場キャリブレーション・試運転費",
      costPrice: null,
      sellPrice: 15000,
      unitLabel: "式",
      notes: "pH 2点校正・試運転込み",
      tags: ["校正", "試運転", "pH"],
    },
  ];

/** 3タブ分を結合（追記用の単一ソース） */
export const PRICE_COST_MASTER_SEED_V1: PriceCostMasterItemSeedV1[] = [
  ...PRICE_COST_MASTER_PARTS_SEED_V1,
  ...PRICE_COST_MASTER_SUBS_SEED_V1,
  ...PRICE_COST_MASTER_LABOR_SEED_V1,
  ...PRICE_COST_MASTER_GENRE_PARTS_SEED_V1,
  ...PRICE_COST_MASTER_GENRE_LABOR_SEED_V1,
];
