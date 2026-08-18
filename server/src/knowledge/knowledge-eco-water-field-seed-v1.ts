/**
 * Eco-Water 現場ナレッジ追記
 * （RS485・pH校正・浸漬設置）
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

/** module-items.json 向けシード行 */
export interface EcoWaterFieldModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

/** モジュール用の安定 ID（再デプロイで上書き更新） */
export const ECO_WATER_FIELD_MODULE_SEED_IDS = [
  "kn-seed-ew-rs485-modbus-001",
  "kn-seed-ew-ph-cal-001",
  "kn-seed-ew-sensor-install-001",
] as const;

/** Knowledge Card 用 ID（検索インデックス連携） */
export const ECO_WATER_FIELD_CARD_IDS = [
  "EW-RS485-MODBUS-001",
  "EW-PH-CAL-001",
  "EW-SENSOR-INSTALL-001",
] as const;

const SEED_CREATED_AT = "2026-08-18T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-18";

type EcoWaterFieldSeedDef = {
  moduleId: (typeof ECO_WATER_FIELD_MODULE_SEED_IDS)[number];
  cardId: (typeof ECO_WATER_FIELD_CARD_IDS)[number];
  title: string;
  tags: string[];
  summaryLines: [string, string, string];
  body: string;
  genre: string;
};

const RS485_BODY = [
  "【A/B 極性逆接の挙動】",
  "RS-485 は差動通信のため、A/B を逆に結線すると",
  "波形の極性が反転する。通信は通っているように見えても",
  "Modbus フレームが CRC エラーやタイムアウトになる。",
  "不通時はまずテスターで A-B 間電圧を確認し、",
  "スレーブ側の A/B を入れ替えて再試行する。",
  "機器によっては D+/D-、A+/B- の表記がメーカーで",
  "逆になることがある。実機シルクと取説を照合する。",
  "",
  "【ボーレートとスレーブ ID】",
  "初期値は 9600bps / 8N1 / スレーブ ID=1 が多い。",
  "PLC・変換器・pH トランスミッターで ID が重複すると",
  "応答が衝突し、間欠不通になる。1 バス 1 ID を徹底する。",
  "パリティやストップビットの不一致も不通原因になる。",
  "",
  "【終端抵抗 120Ω】",
  "バスの両端（マスター側と最遠スレーブ）にのみ",
  "120Ω を入れる。中間機器への終端は反射を増やす。",
  "短距離（数 m 以内の盤内）では終端なしでも通ることが多い。",
  "長距離や高速（38400bps 以上）では必須に近い。",
  "",
  "【ノイズ対策と GND 共通化】",
  "シールド付きツイストペアを使い、",
  "シールドは片端接地（制御盤側 1 点）とする。",
  "両端接地はループ電流でノイズを拾う。",
  "信号 GND（SG / COM）を機器間で共通化しないと",
  "コモンモード電圧が規格を超え、IC 破損や間欠不通になる。",
  "動力線と平行配線する場合は 300mm 以上離すか、",
  "金属ダクトで分離する。",
].join("\n");

const CAL_BODY = [
  "【標準液への浸漬手順】",
  "1. 電極を純水ですすぎ、柔らかい紙で水分を吸い取る。",
  "2. pH6.86（中性点付近）の標準液に電極を浸漬し、",
  "   値が安定するまで待つ（通常 30〜90 秒）。",
  "3. トランスミッターでゼロ点（オフセット）を合わせる。",
  "4. 純水ですすぎ、pH4.01（酸性）または pH9.18",
  "   （アルカリ）へ浸漬し、スパン（傾き）を合わせる。",
  "5. 強アルカリ排水現場では pH9.18 側を優先する。",
  "   Eco-Water の放流判定（5.8〜8.6）に近い点が重要。",
  "",
  "【ゼロ点 / スパン調整】",
  "ゼロ点は基準液の指示差をオフセット補正する。",
  "スパンは 2 点間の傾きを合わせ、応答直線性を確保する。",
  "クエン酸洗浄後も値がズレる場合は、膜表面の残留物や",
  "内部液の濃度変化が原因のことが多い。洗浄→すすぎ→",
  "標準液 2 点校正を必ず実施してから自動運転へ戻す。",
  "",
  "【校正液管理と電極寿命】",
  "標準液の使い回しは禁止。開封後は汚染と CO₂ 吸収で",
  "値が変わる。使い切り、または期限管理する。",
  "温度補償（ATC）が有効か確認する。液温と校正液温が",
  "大きく違うと見かけの誤差が出る。",
  "校正しても応答が遅い・振れが大きい場合は電極寿命。",
  "ガラス膜の曇り、KCl 結晶、応答 3 分以上は交換目安。",
].join("\n");

const INSTALL_BODY = [
  "【設置角度】",
  "電極内部に気泡が溜まるとガラス膜が液面から離れ、",
  "見かけ上 pH が跳ねる・応答が止まる。",
  "垂直〜斜め 45 度以上で設置し、先端が常に液中にある",
  "姿勢を保つ。逆さ設置（先端が上）は厳禁。",
  "気泡が膜面に滞留し、校正直後でも指示が狂う。",
  "",
  "【水流・スラッジ対策】",
  "水流の直撃は膜を傷つけ、指示が不安定になる。",
  "異物（砂利・セメント塊）の衝突を避けるため、",
  "VP 管スリーブ等の保護管を電極周囲に施工する。",
  "サンプリング槽（分岐ピット）を設け、本流から",
  "静かな液を取る設計が望ましい。",
  "槽底のスラッジ堆積位置より上に先端を置く。",
  "",
  "【常時浸漬と配線防水】",
  "液面低下時に電極が乾燥すると内部液が結晶化する。",
  "最低水位でも先端が 50mm 以上浸かる深さを確保する。",
  "配線引き出し部はグランド・防水コネクタ・ブチル",
  "テープで処理し、結露水の侵入を防ぐ。",
  "シールド線は制御盤側で片端接地する。",
].join("\n");

/**
 * Eco-Water 現場ナレッジ 3 件。
 * summary は 3 行要約（改行結合）。
 */
const ECO_WATER_FIELD_DEFS: EcoWaterFieldSeedDef[] = [
  {
    moduleId: "kn-seed-ew-rs485-modbus-001",
    cardId: "EW-RS485-MODBUS-001",
    title: "RS485・Modbus通信の結線と不通トラブルシューティング",
    tags: ["IoT", "通信", "トラブルシュート", "RS485"],
    genre: "IoT",
    summaryLines: [
      "通信不通時はまずA/B結線の反転（極性逆接）を確認。",
      "初期ボーレート（9600bps等）とスレーブIDの不一致をチェック。",
      "長距離配線時はツイストペアシールド線と片端接地を徹底。",
    ],
    body: RS485_BODY,
  },
  {
    moduleId: "kn-seed-ew-ph-cal-001",
    cardId: "EW-PH-CAL-001",
    title: "pHセンサーの標準液校正（キャリブレーション）手順",
    tags: ["施工方法", "保守", "Eco-Water", "点検"],
    genre: "IoT",
    summaryLines: [
      "pH標準液（6.86・4.01/9.18）を用いた2点校正を実施。",
      "クエン酸洗浄後でも測定値がズレる場合の必須復旧手順。",
      "校正液の使い回し厳禁と温度補償の確認。",
    ],
    body: CAL_BODY,
  },
  {
    moduleId: "kn-seed-ew-sensor-install-001",
    cardId: "EW-SENSOR-INSTALL-001",
    title: "水質センサーの現場配管・浸漬設置基準",
    tags: ["施工方法", "現場", "Eco-Water"],
    genre: "IoT",
    summaryLines: [
      "電極内部の気泡溜まりを防ぐため垂直〜斜め45度以上で設置。",
      "水流直撃や異物衝突を避ける保護管（VP管スリーブ）施工。",
      "液面低下時の乾燥を防ぐ常時浸漬深さの確保。",
    ],
    body: INSTALL_BODY,
  },
];

function joinSummary(lines: [string, string, string]): string {
  return lines.join("\n");
}

/** Knowledge Module（カード UI）向けシード */
export function getEcoWaterFieldModuleSeedItemsV1(): EcoWaterFieldModuleSeedItemV1[] {
  return ECO_WATER_FIELD_DEFS.map((d) => ({
    id: d.moduleId,
    title: d.title,
    summary: joinSummary(d.summaryLines),
    body: d.body,
    genre: d.genre,
    tags: [...d.tags],
    pdf_url: null,
    createdAt: SEED_CREATED_AT,
  }));
}

/** Knowledge Cards（統合検索）向け入力 */
export function getEcoWaterFieldCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return ECO_WATER_FIELD_DEFS.map((d) => ({
    id: d.cardId,
    title: d.title,
    category: "Eco-Water",
    tags: [...d.tags],
    summary: `${joinSummary(d.summaryLines)}\n\n${d.body}`,
    body: d.body,
    files: [],
    updatedAt: SEED_UPDATED_AT,
    sourceType: "manual" as const,
    qnapSyncStatus: "pending" as const,
  }));
}

/**
 * Knowledge Cards へ現場ナレッジを upsert。
 * 未登録のみ作成し、内容差があれば更新する。
 * 既存カードは ID 不一致なら触れない。
 */
export function seedEcoWaterFieldKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getEcoWaterFieldCardSeedInputsV1()) {
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
    created.push(
      saveKnowledgeCardV1(input, { skipQnapQueue: true })
    );
  }

  const index = loadKnowledgeSearchIndexV1();
  const indexed = new Set(index.entries.map((e) => e.id));
  const missingInIndex = ECO_WATER_FIELD_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
