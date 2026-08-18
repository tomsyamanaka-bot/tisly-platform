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
  /**
   * 添付メディア URL（互換のため
   * フィールド名は pdf_url のまま）。
   * PDF / 写真 / 動画を格納する。
   */
  pdf_url?: string | null;
  /** 複数添付（新形式） */
  medias?: Array<{
    url: string;
    fileName?: string;
    kind?: "pdf" | "image" | "video" | "unknown";
  }>;
  /** URL 配列・単一値の既存形式も読み取り対象 */
  files?: Array<string | { url: string; fileName?: string }>;
  media?: string | { url: string; fileName?: string } | null;
  file?: string | { url: string; fileName?: string } | null;
  createdAt: string;
  /** 本文詳細（任意・既存カードは未設定のまま） */
  body?: string;
}

/** 画面上部のジャンルタブ・かんたん登録セレクト */
export const KNOWLEDGE_GENRES = [
  "すべて",
  "プラント",
  "IoT",
  "制御",
  "電気",
  "ネットワーク",
  "セキュリティー",
  "TV工事",
  "防犯カメラ",
  "エアコン",
  "空調",
] as const;

export type KnowledgeGenre = (typeof KNOWLEDGE_GENRES)[number];

/** 画面上部のクイックタグ（初期表示用 · 登録済みタグは API から動的生成） */
export const QUICK_TAGS = [
  "すべて",
  "IoT",
  "施工方法",
  "アイデア",
  "プラント",
  "製作ノウハウ",
  "仕上げ",
  "Eco-Water",
  "水質",
] as const;

export type QuickTag = (typeof QUICK_TAGS)[number];

/**
 * 初期モック参照（実データは API module-items）。
 * 手作り→工業仕上げノウハウ 4 件のタイトル一覧。
 */
export const FAB_FINISH_KNOWLEDGE_TITLES = [
  "パテ盛り＋サンディングによる段差・継ぎ目消し技術",
  "プラサフ（下地）とマット塗装による工業POM質感仕上げ",
  "溶剤接着（溶着）によるシームレスアクリル配管",
  "ゴムベルトの斜めカット（スカイブ接合）による静音駆動",
] as const;

/** Eco-Water pH センサー保守ナレッジ（末尾追記） */
export const ECO_WATER_PH_KNOWLEDGE_TITLES = [
  "工業用・水質pHセンサーの耐久性と寿命基準",
  "pHセンサーの定期点検・現場メンテナンス手順（クエン酸洗浄）",
] as const;

const ECO_WATER_PH_CREATED_AT = "2026-08-18T00:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存仕上げノウハウ配列は改変せず、
 * 末尾に Eco-Water 2 件を独立配列で保持する。
 */
export const MOCK_ECO_WATER_PH_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-ew-ph-life-001",
    title: "工業用・水質pHセンサーの耐久性と寿命基準",
    summary: [
      "pH電極は化学的な消耗品（寿命は約半年〜1年半）。",
      "セメント等の強アルカリ排水下では3〜6ヶ月で反応低下。",
      "送信機は流用し、先端電極のみ格安交換する保守設計が最適。",
    ].join("\n"),
    genre: "IoT",
    tags: ["IoT", "水質", "保守", "Eco-Water"],
    pdf_url: null,
    createdAt: ECO_WATER_PH_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-ew-ph-maint-001",
    title: "pHセンサーの定期点検・現場メンテナンス手順（クエン酸洗浄）",
    summary: [
      "点検時は透明保護キャップを外し、擦らず浸け置き洗浄。",
      "5〜10%クエン酸水に2〜5分浸けてセメントカスを溶解。",
      "保管時は保護液（3M KCl）で乾燥を防ぎ、PWAで点検モード運用。",
    ].join("\n"),
    genre: "IoT",
    tags: ["施工方法", "保守", "Eco-Water", "点検"],
    pdf_url: null,
    createdAt: ECO_WATER_PH_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
];
