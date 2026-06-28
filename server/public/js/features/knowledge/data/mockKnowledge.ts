/**
 * Knowledge モジュール型定義
 */

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  /** 大分類（ジャンルタブで絞り込み） */
  genre: string;
  tags: string[];
  createdAt: string;
}

/** 画面上部のジャンルタブ */
export const KNOWLEDGE_GENRES = ["すべて", "プラント", "IoT", "制御"] as const;

export type KnowledgeGenre = (typeof KNOWLEDGE_GENRES)[number];

export const INITIAL_KNOWLEDGE_MOCK: KnowledgeItem[] = [
  {
    id: "kn-mock-cola-silo",
    title: "炭酸コーラ瓶で作る格安サイロミニチュア",
    summary:
      "外径150mmのポリカパイプは高価なため、コーラの1.5Lペットボトルを上下逆さまにしてローコストに自作。" +
      "形状が最初からサイロ＋ホッパーに最適で、キャップがそのまま排出ゲートの土台になる。" +
      "透明度が高く、24V静電容量式近接センサーを外側に貼るだけで残量検知が可能。",
    genre: "プラント",
    tags: ["アイデア", "プラント"],
    createdAt: "2026-06-20T09:00:00.000Z",
  },
  {
    id: "kn-mock-belt-tape",
    title: "ベルトコンベア用ゴムシートの裏面布テープ補強",
    summary:
      "ゴムシート2枚の重ね貼りは、ベルトが硬くなり剛性が跳ね上がるため小型モーターで回らなくなるリスクあり。" +
      "対策として、ギザギザ面のゴム1枚だけを幅5cmで切り出し、裏面全体に強力布粘着テープ（ゴリラテープ等）をぐるっと1周貼って柔軟性と引っ張り強度を両立させる。",
    genre: "プラント",
    tags: ["施工方法", "プラント"],
    createdAt: "2026-06-21T10:30:00.000Z",
  },
  {
    id: "kn-mock-rp2350-poe",
    title: "Waveshare製 RP2350-POE-ETH-8DI-8RO の仕様",
    summary:
      "Raspberry Piの最新マイコン「RP2350」搭載。LANケーブル1本で通信と電源が取れるPoE対応で、" +
      "リレー出力8個、デジタル入力8個、RS485端子（三菱FX系PLC等の通信用）を備え、" +
      "DINレールにカチッとはまる産業用信頼性を持つ最強の現場特化型ボード。",
    genre: "IoT",
    tags: ["IoT"],
    createdAt: "2026-06-22T14:00:00.000Z",
  },
  {
    id: "kn-mock-plc-self-hold",
    title: "PLC自己保持回路の基本配線",
    summary:
      "押しボタン1点で自己保持させる定番回路。" +
      "停止は別接点でコイルを遮断し、再起動は押しボタンで行う。",
    genre: "制御",
    tags: ["施工方法", "PLC"],
    createdAt: "2026-06-23T11:00:00.000Z",
  },
];

/** 画面上部のクイックタグ */
export const QUICK_TAGS = ["すべて", "IoT", "施工方法", "アイデア", "プラント"] as const;

export type QuickTag = (typeof QUICK_TAGS)[number];
