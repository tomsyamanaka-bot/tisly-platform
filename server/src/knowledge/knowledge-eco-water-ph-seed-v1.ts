/**
 * Eco-Water pH センサー保守ナレッジ
 * （工業用電極の寿命・クエン酸洗浄）
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
export interface EcoWaterPhModuleSeedItemV1 {
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
export const ECO_WATER_PH_MODULE_SEED_IDS = [
  "kn-seed-ew-ph-life-001",
  "kn-seed-ew-ph-maint-001",
] as const;

/** Knowledge Card 用 ID（検索インデックス連携） */
export const ECO_WATER_PH_CARD_IDS = [
  "EW-PH-LIFE-001",
  "EW-PH-CITRIC-001",
] as const;

const SEED_CREATED_AT = "2026-08-18T00:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-18";

type EcoWaterPhSeedDef = {
  moduleId: (typeof ECO_WATER_PH_MODULE_SEED_IDS)[number];
  cardId: (typeof ECO_WATER_PH_CARD_IDS)[number];
  title: string;
  tags: string[];
  summaryLines: [string, string, string];
  body: string;
  genre: string;
};

const LIFE_BODY = [
  "設置環境で寿命は大きく変わる。",
  "一般的な中和槽・放流ピットでは、",
  "ガラス膜電極の交換目安は約半年〜1年半。",
  "セメント・生コンヤードの強アルカリ排水",
  "（pH12前後）では膜のエッチングが進み、",
  "3〜6ヶ月で応答が鈍くなる。",
  "高温排水や酸洗浄槽でも同様に短い。",
  "",
  "電極は乾燥厳禁。ガラス膜が乾くと",
  "内部液（KCl）が結晶化し、オフセット異常や",
  "応答不能の原因になる。保管・運搬時は",
  "保護キャップに 3M KCl（または指定保護液）",
  "を入れ、常時湿潤を保つ。",
  "",
  "月額サブスク（定期交換プラン）では、",
  "送信機・変換器・PoE/Modbus 配線は流用し、",
  "消耗する先端電極だけを現場寿命に合わせて交換する。",
  "校正記録と次回交換日を PWA で管理し、",
  "放流基準（pH5.8〜8.6）を安定維持する。",
].join("\n");

const MAINT_BODY = [
  "【クエン酸浸け置き】",
  "1. PWA で当該現場を点検モードにする。",
  "CO₂電磁弁・酸注入リレーをロックし、",
  "誤中和・誤放流を防ぐ。",
  "2. 透明保護キャップを外す。",
  "ガラス膜は布で擦らない。",
  "3. 5〜10% クエン酸水を用意し、",
  "電極先端を 2〜5 分浸け置きする。",
  "セメントカス・カルシウムを溶解する。",
  "強いこすり洗いは膜を傷つけるため禁止。",
  "",
  "【すすぎと水分の吸い取り】",
  "4. 純水またはきれいな水ですすぐ。",
  "柔らかい紙やワイパーで水分を優しく吸い取る。",
  "ガラス膜そのものは拭き取らない。",
  "5. 再設置する場合は測定液で安定を待つ。",
  "保管する場合は保護キャップに 3M KCl を入れて装着する。",
  "",
  "【メンテナンスモード連携】",
  "6. 点検完了後に点検モードを解除する。",
  "pH が安定してから自動中和を再開する。",
  "必要なら標準液（pH7 / pH4 または pH9）で校正し、",
  "結果を保守カードへ記録する。",
].join("\n");

/**
 * Eco-Water pH センサー保守 2 件。
 * summary は 3 行要約（改行結合）。
 */
const ECO_WATER_PH_DEFS: EcoWaterPhSeedDef[] = [
  {
    moduleId: "kn-seed-ew-ph-life-001",
    cardId: "EW-PH-LIFE-001",
    title: "工業用・水質pHセンサーの耐久性と寿命基準",
    tags: ["IoT", "水質", "保守", "Eco-Water"],
    genre: "IoT",
    summaryLines: [
      "pH電極は化学的な消耗品（寿命は約半年〜1年半）。",
      "セメント等の強アルカリ排水下では3〜6ヶ月で反応低下。",
      "送信機は流用し、先端電極のみ格安交換する保守設計が最適。",
    ],
    body: LIFE_BODY,
  },
  {
    moduleId: "kn-seed-ew-ph-maint-001",
    cardId: "EW-PH-CITRIC-001",
    title: "pHセンサーの定期点検・現場メンテナンス手順（クエン酸洗浄）",
    tags: ["施工方法", "保守", "Eco-Water", "点検"],
    genre: "IoT",
    summaryLines: [
      "点検時は透明保護キャップを外し、擦らず浸け置き洗浄。",
      "5〜10%クエン酸水に2〜5分浸けてセメントカスを溶解。",
      "保管時は保護液（3M KCl）で乾燥を防ぎ、PWAで点検モード運用。",
    ],
    body: MAINT_BODY,
  },
];

function joinSummary(lines: [string, string, string]): string {
  return lines.join("\n");
}

/** Knowledge Module（カード UI）向けシード */
export function getEcoWaterPhModuleSeedItemsV1(): EcoWaterPhModuleSeedItemV1[] {
  return ECO_WATER_PH_DEFS.map((d) => ({
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
export function getEcoWaterPhCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return ECO_WATER_PH_DEFS.map((d) => ({
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
 * Knowledge Cards へ pH 保守ナレッジを upsert。
 * 未登録のみ作成し、内容差があれば更新する。
 * 既存カードは ID 不一致なら触れない。
 */
export function seedEcoWaterPhKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getEcoWaterPhCardSeedInputsV1()) {
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
  const missingInIndex = ECO_WATER_PH_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
