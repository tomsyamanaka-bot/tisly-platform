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
  /** 8統一ジャンル（既存 genre は維持） */
  unifiedGenre?: string;
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
  "電気工事",
  "音響",
  "IOT関連",
] as const;

export type KnowledgeGenre = (typeof KNOWLEDGE_GENRES)[number];

/** 一覧上部のワンタップジャンル（8統一） */
export const UNIFIED_GENRE_FILTER_TABS = [
  "すべて",
  "電気工事",
  "防犯カメラ",
  "ネットワーク",
  "TV工事",
  "エアコン",
  "空調",
  "音響",
  "IOT関連",
] as const;

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
  "通信",
  "RS485",
  "現場",
  "IOT関連",
  "電気工事",
  "防犯",
  "ミリ波",
  "SIM",
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

/** Eco-Water 現場ナレッジ 3 件（末尾追記） */
export const ECO_WATER_FIELD_KNOWLEDGE_TITLES = [
  "RS485・Modbus通信の結線と不通トラブルシューティング",
  "pHセンサーの標準液校正（キャリブレーション）手順",
  "水質センサーの現場配管・浸漬設置基準",
] as const;

const ECO_WATER_FIELD_CREATED_AT = "2026-08-18T12:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存仕上げ・pH配列は改変せず、
 * 末尾に現場ナレッジ 3 件を独立配列で保持する。
 */
export const MOCK_ECO_WATER_FIELD_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-ew-rs485-modbus-001",
    title: "RS485・Modbus通信の結線と不通トラブルシューティング",
    summary: [
      "通信不通時はまずA/B結線の反転（極性逆接）を確認。",
      "初期ボーレート（9600bps等）とスレーブIDの不一致をチェック。",
      "長距離配線時はツイストペアシールド線と片端接地を徹底。",
    ].join("\n"),
    genre: "IoT",
    tags: ["IoT", "通信", "トラブルシュート", "RS485"],
    pdf_url: null,
    createdAt: ECO_WATER_FIELD_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-ew-ph-cal-001",
    title: "pHセンサーの標準液校正（キャリブレーション）手順",
    summary: [
      "pH標準液（6.86・4.01/9.18）を用いた2点校正を実施。",
      "クエン酸洗浄後でも測定値がズレる場合の必須復旧手順。",
      "校正液の使い回し厳禁と温度補償の確認。",
    ].join("\n"),
    genre: "IoT",
    tags: ["施工方法", "保守", "Eco-Water", "点検"],
    pdf_url: null,
    createdAt: ECO_WATER_FIELD_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-ew-sensor-install-001",
    title: "水質センサーの現場配管・浸漬設置基準",
    summary: [
      "電極内部の気泡溜まりを防ぐため垂直〜斜め45度以上で設置。",
      "水流直撃や異物衝突を避ける保護管（VP管スリーブ）施工。",
      "液面低下時の乾燥を防ぐ常時浸漬深さの確保。",
    ].join("\n"),
    genre: "IoT",
    tags: ["施工方法", "現場", "Eco-Water"],
    pdf_url: null,
    createdAt: ECO_WATER_FIELD_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-sec-floor-mmwave-001",
    title:
      "【防犯・セキュリティ】フロア俯瞰図連動とミリ波レーダー（HLK-LD2410B）のDI直結施工",
    summary:
      "ビーマーや露出ボックス内にHLK-LD2410Bを仕込み、RP2350のDIへ直結。フロアマップ上でリアルタイムに該当エリアを発光させる配線手法。",
    genre: "セキュリティー",
    tags: ["防犯", "ミリ波", "RP2350", "施工方法", "IOT関連"],
    pdf_url: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    body: [
      "【機器と仕込み位置】",
      "HLK-LD2410B をビーマー内部、または",
      "露出ボックスの奥に収める。レンズ面は",
      "人の動線に向け、金属カバーで電波を",
      "遮らない。",
    ].join("\n"),
  },
  {
    id: "kn-seed-sec-flood-yellow-001",
    title:
      "【照明・害虫対策】投光器6500Kの防虫クリアイエロー塗装ハック",
    summary:
      "ダイヤワイト等の「透過型クリアイエロー」をレンズカバーに塗装し、誘虫波長（紫外線〜青色）をカットしてカメラ誤作動と虫害を防ぐ手法。",
    genre: "防犯カメラ",
    tags: ["照明", "害虫", "カメラ", "アイデア"],
    pdf_url: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    body: [
      "【塗装ハック】",
      "ダイヤワイト等の透過型クリアイエローを",
      "レンズカバーへ薄く塗装する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-sec-gas-pulse-001",
    title:
      "【住設ハック】ガスメーターパルス（DT/SG）＆ケイホウ直結による24時間見守り",
    summary:
      "ガスメーターの接点からRP2350へ2芯弱電線を直結し、自動検針・24時間ガス未検知アラート・地震自動遮断通知をPWAへ即時連携させる仕組み。",
    genre: "IOT関連",
    tags: ["ガス", "見守り", "RP2350", "施工方法", "IOT関連"],
    pdf_url: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    body: [
      "【接点取り出し】",
      "ガスメーターのパルス（DT/SG）接点から",
      "RP2350 DI へ 2 芯弱電線を直結する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-sec-sim-watch-001",
    title:
      "【通信設計】格安SIM（月1〜3GB）での低コスト遠隔監視・ホームセキュリティ運用",
    summary:
      "センサーログや接点信号はテキスト（軽量）で常時通信し、カメラはオンデマンド/イベント発動時のみ送信することで月額通信費を最小化する設計。",
    genre: "ネットワーク",
    tags: ["通信", "SIM", "監視", "IOT関連"],
    pdf_url: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    body: [
      "【通信設計】",
      "格安 SIM 月 1〜3GB を前提に設計する。",
      "センサーログと接点はテキストで常時送信。",
    ].join("\n"),
  },
];

/** TiSLY 運用知見ナレッジ 5 件（末尾追記） */
export const OPS_INSIGHT_KNOWLEDGE_TITLES = [
  "【センサー・設計】産業・防犯用センサーの応答速度とソフトウェアディレイ設計基準",
  "【防犯・施工】人感・ミリ波センサーのデバウンス黄金比（100ms）と草木誤検知防止",
  "【UI/UX・3D】お掃除ロボット風 3Dアイソメトリック間取り図の視認性・操作性設計",
  "【エッジ・運用】RP2350のハートビート5分周期化とタイムスケジュール警戒システム",
  "【ブランド・アセット】TiSLY公式立体シールドエンブレムロゴの規格とPWA統一配置",
] as const;

const OPS_INSIGHT_CREATED_AT = "2026-08-26T00:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に運用知見 5 件を
 * 独立配列で保持する。
 */
export const MOCK_OPS_INSIGHT_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-sensor-delay-design-001",
    title:
      "【センサー・設計】産業・防犯用センサーの応答速度とソフトウェアディレイ設計基準",
    summary: [
      "物理現象・化学反応に応じた時定数（pH: 10〜30秒、水位: 3秒、CT平滑化: 1〜3秒）。",
      "赤外線ビーム（50〜100ms）やミリ波（100ms）の応答特性。",
      "外乱ノイズ遮断と誤報ゼロを実現するマイコン側の遅延確定ロジック。",
    ].join("\n"),
    genre: "IoT",
    tags: ["#Sensor", "#RP2350", "#Delay", "#Hardware"],
    pdf_url: null,
    createdAt: OPS_INSIGHT_CREATED_AT,
    body: [
      "【時定数の違い】",
      "センサーは物理・化学変化を測るため、",
      "応答に固有の時定数がある。",
      "pH はガラス膜のイオン交換で 10〜30 秒、",
      "水位フロートは浮力安定まで約 3 秒、",
      "CT（電流）は平滑化で 1〜3 秒を要する。",
      "",
      "【防犯センサーの応答】",
      "赤外線ビーム遮断は 50〜100ms、",
      "ミリ波（LD2410 系）は約 100ms で",
      "人が通過した判定が出る。",
      "PIR は熱変化の蓄積で数百 ms〜数秒。",
      "炎・漏水も媒質や接点バウンスに依存する。",
      "",
      "【RP2350 側の確定ロジック】",
      "生サンプリングだけでは外乱ノイズで",
      "誤報になる。移動平均とディレイ判定を",
      "組み合わせ、閾値超えが N サンプル連続",
      "したときだけ ON を確定する。",
      "誤報ゼロを優先し、物理時定数より",
      "短すぎる確定は避ける。",
    ].join("\n"),
  },
  {
    id: "kn-seed-radar-debounce-100ms-001",
    title:
      "【防犯・施工】人感・ミリ波センサーのデバウンス黄金比（100ms）と草木誤検知防止",
    summary: [
      "歩行速度（時速4km=28cm/0.25秒）と早歩き（時速6km）の通過パルス幅評価。",
      "50msでは風による草木揺れを拾うリスクがあり、現場では100ms〜150msが最適解。",
      "レーダーの距離ゲート調整（HLKRadarTool）と床上70〜100cm設置による物理防犯施工。",
    ].join("\n"),
    genre: "セキュリティー",
    tags: ["#Security", "#Radar", "#LD2410", "#FalseAlarm"],
    pdf_url: null,
    createdAt: OPS_INSIGHT_CREATED_AT,
    body: [
      "【歩行速度とパルス幅】",
      "時速 4km 歩行は 0.25 秒で約 28cm 進む。",
      "レーダー検知ゾーン通過のパルス幅は",
      "この移動距離とゲート幅で決まる。",
      "早歩き（時速 6km）ではパルスが短くなり、",
      "デバウンスが長すぎると取りこぼす。",
      "",
      "【100ms 黄金比】",
      "50ms では風による草木揺れを人検知と",
      "誤認しやすい。現場では 100ms〜150ms が",
      "誤報低減と早歩き通過のバランス最適解。",
      "RP2350 DI 側で OUT をこの時間で確定する。",
      "",
      "【物理施工】",
      "HLKRadarTool で距離ゲートを動線に合わせ、",
      "草木ゾーンを除外する。取付高さは床上",
      "70〜100cm。角度は歩行胴体を狙い、",
      "地面・植栽の反射を避ける。",
    ].join("\n"),
  },
  {
    id: "kn-seed-ui-isometric-3d-001",
    title:
      "【UI/UX・3D】お掃除ロボット風 3Dアイソメトリック間取り図の視認性・操作性設計",
    summary: [
      "白い立体間仕切り壁（ウォールリブ）と部屋別カラー床塗り分け（オリーブ/グレー等）。",
      "視界を邪魔しない半透明白カプセル型ミニバッジ（9〜10px）と独立階層ボタン。",
      "ドラッグ回転・ピンチ拡大・2本指パン移動のスムーズな操作イベント分離。",
    ].join("\n"),
    genre: "IOT関連",
    tags: ["#3D", "#Isometric", "#ThreeJS", "#UIUX"],
    pdf_url: null,
    createdAt: OPS_INSIGHT_CREATED_AT,
    body: [
      "【視認性の骨格】",
      "白い立体間仕切り（ウォールリブ）で",
      "部屋境界を明示し、床は部屋別に",
      "オリーブ／グレー等で塗り分ける。",
      "お掃除ロボット風のアイソメ図は",
      "現場説明と遠隔監視の共通言語になる。",
      "",
      "【UI 階層】",
      "状態表示は半透明白カプセル型の",
      "ミニバッジ（9〜10px）に留め、",
      "視界を遮らない。階層切替は独立ボタン",
      "としてオーバーレイ文字を枠外配置する。",
      "",
      "【操作イベント分離】",
      "スマホ 1 画面向けに 260〜300px の",
      "コンパクト正方形で描画する。",
      "Three.js OrbitControls ではドラッグ回転・",
      "ピンチ拡大・2 本指パンを分離し、",
      "誤操作なくスムーズに動かす。",
    ].join("\n"),
  },
  {
    id: "kn-seed-rp2350-heartbeat-sched-001",
    title:
      "【エッジ・運用】RP2350のハートビート5分周期化とタイムスケジュール警戒システム",
    summary: [
      "常時負荷を抑える300秒（5分）ハートビートと10〜15分しきい値での生存監視。",
      "「夜間のみ」固定から、開始・終了時刻を遠隔設定できる時間指定警戒への進化。",
      "昼間（指定時間外）はライトを消灯しWeb Push/ログのみ記録する省エネ防犯連動。",
    ].join("\n"),
    genre: "IOT関連",
    tags: ["#RP2350", "#Heartbeat", "#Scheduler", "#Security"],
    pdf_url: null,
    createdAt: OPS_INSIGHT_CREATED_AT,
    body: [
      "【5 分ハートビート】",
      "常時負荷を抑えるため RP2350 は",
      "300 秒（5 分）周期で生存通知する。",
      "VPS 側は 10〜15 分無通信でオフライン",
      "判定し、回線瞬断での誤警報を避ける。",
      "",
      "【時間指定警戒】",
      "「夜間のみ」固定から、開始・終了時刻を",
      "遠隔設定できるスケジュール警戒へ進化。",
      "日跨ぎ（例: 19:00〜06:00）は開始≧終了",
      "の判定で正しくカバーする。",
      "",
      "【省エネ連動】",
      "指定時間外はライト消灯し、Web Push と",
      "ログのみ記録する。夜間点灯秒数は",
      "PWA スライダー（5〜180 秒）で同期する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-brand-shield-emblem-001",
    title:
      "【ブランド・アセット】TiSLY公式立体シールドエンブレムロゴの規格とPWA統一配置",
    summary: [
      "青い立体多面体シールド（盾）を基調とした公式エンブレムの策定。",
      "ヘッダーアイコン（高さ32〜40px）、PWAアプリアイコン、ファビコンへの展開。",
      "白ベース×ネイビー基調のプロ向けUIと調和する高解像度アセット管理。",
    ].join("\n"),
    genre: "IOT関連",
    tags: ["#Branding", "#Logo", "#TiSLY", "#Asset"],
    pdf_url: null,
    createdAt: OPS_INSIGHT_CREATED_AT,
    body: [
      "【公式エンブレム】",
      "青い立体多面体シールド（盾）を基調とした",
      "TiSLY 公式エンブレムをブランドの中核に",
      "据える。信頼・防護・プロ品質を象徴する。",
      "",
      "【PWA 配置規格】",
      "ヘッダーアイコンは高さ 32〜40px。",
      "アプリアイコン・ファビコンへ同一系譜を",
      "展開し、白ベース×ネイビー UI と調和させる。",
      "",
      "【アセット管理】",
      "SVG／PNG を解像度別に最適化し、",
      "将来のオーストラリア市場展開でも",
      "同一シンボルで信頼感を維持する。",
    ].join("\n"),
  },
];

/** 防犯・映像・施工ナレッジ 5 件（末尾追記） */
export const SECURITY_STREAM_KNOWLEDGE_TITLES = [
  "【防犯・映像配信】PWA（WebRTC）とネイティブアプリにおける防犯カメラストリーミング比較設計",
  "【防犯・NVR】H.View製NVRおよびマルチメーカーIPカメラのRTSP/サブストリーム統合",
  "【電源・施工】単相200V環境からのマルチ電圧（100-240V）PoEハブ給電ハック",
  "【見守り・センサー】ミリ波レーダー（HLK-LD2410B/LD2450）によるプライバシー保護型安否確認",
  "【住設・サブスク】ガスメーターパルス（DT/SG）直結による自動検針＆24時間見守り",
] as const;

const SECURITY_STREAM_CREATED_AT = "2026-08-26T12:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に防犯・映像 5 件を
 * 独立配列で保持する。
 */
export const MOCK_SECURITY_STREAM_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-cam-webrtc-hybrid-001",
    title:
      "【防犯・映像配信】PWA（WebRTC）とネイティブアプリにおける防犯カメラストリーミング比較設計",
    summary:
      "PWAでのRTSP→WebRTC/HLS変換配信（低遅延・即時性）と、ストアアプリでのネイティブデコード（高負荷マルチ画面・PiP常時監視）の違いとTiSLYにおけるハイブリッド運用指針。",
    genre: "防犯カメラ",
    tags: [
      "#Security",
      "#Camera",
      "#Streaming",
      "#WebRTC",
      "#PWA",
      "#NativeApp",
    ],
    pdf_url: null,
    createdAt: SECURITY_STREAM_CREATED_AT,
    body: [
      "【PWA 配信（低遅延・即時性）】",
      "現場スマホは PWA で即閲覧できることが",
      "最優先。NVR/カメラの RTSP をゲートウェイで",
      "WebRTC または HLS に変換し、ブラウザ再生する。",
      "WebRTC はサブ秒〜数秒の低遅延向き。",
      "HLS は互換性が高く回線変動に強い。",
      "",
      "【ネイティブアプリ】",
      "ストアアプリはハードデコードと PiP、",
      "マルチ画面常時監視に強い。CPU/GPU 負荷の",
      "高い同時視聴やバックグラウンド監視は",
      "ネイティブ側へ寄せる。",
      "",
      "【TiSLY ハイブリッド指針】",
      "日常確認・発報直後のクイック視聴は PWA。",
      "常時監視・多分割はネイティブ。同一 NVR の",
      "サブストリーム URL を両クライアントで共有し、",
      "設計・施工・月額監視を一元化する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-nvr-hview-rtsp-001",
    title:
      "【防犯・NVR】H.View製NVRおよびマルチメーカーIPカメラのRTSP/サブストリーム統合",
    summary:
      "H.ViewやReolink等のNVRからRTSPサブストリーム（例: /unicast/c1/s1/live）を抽出し、PWA上で軽量・低遅延に同時マルチカメラ表示を行う手法。",
    genre: "防犯カメラ",
    tags: ["#Security", "#Camera", "#NVR", "#RTSP", "#HView"],
    pdf_url: null,
    createdAt: SECURITY_STREAM_CREATED_AT,
    body: [
      "【RTSP サブストリーム抽出】",
      "H.View / Reolink 等の NVR ではメインは高解像、",
      "サブは軽量（例: /unicast/c1/s1/live）。",
      "PWA 同時マルチ表示はサブストリームを基本にし、",
      "帯域と端末負荷を抑える。",
      "",
      "【統合手順】",
      "1. NVR 管理画面で各チャネルの RTSP URL を控える。",
      "2. 認証（user/pass）とポートを物件カードへ保存。",
      "3. 変換ゲートウェイへ登録し PWA タイルへ割当。",
      "4. メインは録画・ズーム、サブは一覧ライブ。",
      "",
      "【現場注意】",
      "メーカー差でパスが異なる。実機で再生確認し、",
      "失敗時は ONVIF で再取得する。LAN 内完結を優先し、",
      "外部公開は VPN または中継に限定する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-poe-200v-hub-001",
    title:
      "【電源・施工】単相200V環境からのマルチ電圧（100-240V）PoEハブ給電ハック",
    summary:
      "200V電源から直接PoEスイッチ（TL-SG1005P等）へ給電し、LANケーブル1本でカメラ・RP2350・センサーへ一括送電する省配線施工。",
    genre: "電気工事",
    tags: ["#Electrical", "#PoE", "#200V", "#Wiring"],
    pdf_url: null,
    createdAt: SECURITY_STREAM_CREATED_AT,
    body: [
      "【単相 200V → マルチ電圧 PoE】",
      "工場・店舗の単相 200V から、入力 100-240V 対応の",
      "PoE スイッチ（例: TL-SG1005P）へ直接給電する。",
      "降圧トランスを省略でき、盤内スペースとコストを削減。",
      "",
      "【省配線施工】",
      "カメラ・RP2350・センサー類は LAN 1 本で",
      "データ＋電源を一括供給。弱電ルートを最小化し、",
      "増設は PoE ポート追加で完結させる。",
      "",
      "【安全確認】",
      "機器の入力定格（100-240V）と接地を必ず照合。",
      "200V 側ブレーカ容量、PoE 総電力予算、",
      "屋外機器のサージ対策を施工チェックへ入れる。",
    ].join("\n"),
  },
  {
    id: "kn-seed-radar-care-privacy-001",
    title:
      "【見守り・センサー】ミリ波レーダー（HLK-LD2410B/LD2450）によるプライバシー保護型安否確認",
    summary:
      "カメラを置けない居室・浴室にミリ波レーダーを露出ボックス裏へ隠蔽設置し、RP2350のDI/UARTで微細呼吸・動線を検出するハック。",
    genre: "IOT関連",
    tags: ["#Radar", "#Care", "#RP2350", "#Privacy"],
    pdf_url: null,
    createdAt: SECURITY_STREAM_CREATED_AT,
    body: [
      "【プライバシー優先の安否確認】",
      "居室・浴室などカメラ設置が難しい場所では、",
      "HLK-LD2410B / LD2450 ミリ波レーダーを用いる。",
      "映像を撮らず、在室・微動・呼吸相当の変化を検知する。",
      "",
      "【隠蔽設置】",
      "露出ボックス裏やビーマー内部へ仕込み、",
      "見た目は通常のスイッチボックスのままにする。",
      "電波はプラスチックカバーを透過する前提で位置決め。",
      "",
      "【RP2350 連携】",
      "OUT は DI、詳細は UART で距離ゲート等を読む。",
      "無反応しきい値で見守りアラートを PWA / Web Push へ。",
      "防犯人感とは別タグ・別しきい値で運用する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-gas-pulse-subsc-001",
    title:
      "【住設・サブスク】ガスメーターパルス（DT/SG）直結による自動検針＆24時間見守り",
    summary:
      "ガスメーターの無電圧パルスをRP2350で読み取り、月1〜3GBの格安SIM経由で検針・異常遮断・生活反応をPWAへ即時連携する低コスト運用。",
    genre: "IOT関連",
    tags: ["#Gas", "#Pulse", "#Subsc", "#PWA"],
    pdf_url: null,
    createdAt: SECURITY_STREAM_CREATED_AT,
    body: [
      "【パルス直結】",
      "ガスメーターの無電圧パルス（DT/SG）を",
      "RP2350 DI へ 2 芯弱電で直結する。",
      "積算で自動検針、長時間ゼロで生活反応アラート、",
      "感震遮断接点は別 DI で即時通知する。",
      "",
      "【低コスト通信】",
      "月 1〜3GB 格安 SIM でテキストログを常時送信。",
      "映像は使わず通信費を最小化し、月額見守り",
      "サブスクの原価を抑える。",
      "",
      "【PWA 一元管理】",
      "検針値・異常・生活反応を顧客ポータルへ反映。",
      "テナント単位でデバイスとプラン状態を紐づけ、",
      "SaaS 課金の土台とする。",
    ].join("\n"),
  },
];

/** 現場DX・音声AIナレッジ（末尾追記） */
export const VOICE_CALL_KNOWLEDGE_TITLES = [
  "【現場DX・音声AI】通話録音テキストからのGoogleカレンダー自動同期＆材料自動抽出アーキテクチャ",
] as const;

const VOICE_CALL_CREATED_AT = "2026-08-26T21:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に音声AI 1 件を保持。
 */
export const MOCK_VOICE_CALL_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-voice-call-calendar-dx-001",
    title:
      "【現場DX・音声AI】通話録音テキストからのGoogleカレンダー自動同期＆材料自動抽出アーキテクチャ",
    summary: [
      "市販イヤホン（骨伝導等）での通話テキストをPWAへ受け渡すワークフロー。",
      "Geminiによる日程・現場名・材料リストの自動構造化とJSON抽出。",
      "通話後ワンタップでGoogleカレンダーとTiSLY材料チェックへ同時登録する省力化。",
    ].join("\n"),
    genre: "IOT関連",
    tags: ["#VoiceAI", "#Gemini", "#Calendar", "#FieldDX", "#PWA"],
    pdf_url: null,
    createdAt: VOICE_CALL_CREATED_AT,
    body: [
      "【ワークフロー】",
      "市販イヤホン（骨伝導等）や通話録音アプリで",
      "得たテキストを、PWA「通話音声・クイック入力」",
      "へワンタップ貼付する。Web Speech API による",
      "その場の文字起こしも併用できる。",
      "",
      "【LLM プロンプト設計】",
      "Gemini に JSON のみを返させる。抽出項目は",
      "予定（件名・開始・終了・場所）、材料",
      "（品名・数量・単位・発注フラグ）、案件メモ",
      "（3行要約・要望・決定事項）。キー未設定時は",
      "ルールベース抽出にフォールバックする。",
      "",
      "【データフロー】",
      "抽出プレビュー確認後、ワンタップで",
      "Google Calendar API（mock/real）へ予定登録し、",
      "同時に材料チェックへ部材を追記、案件メモへ",
      "要約を保存する。tenant_id / JP|AU / JPY|AUD",
      "を意識した拡張ポイントをログに残す。",
    ].join("\n"),
  },
];

/** 製造DX・方眼紙→STL ナレッジ（末尾追記） */
export const FACTORY_STL_KNOWLEDGE_TITLES = [
  "【製造DX】方眼紙スケッチ✕Gemini Visionによる手書き図面からの即時STL生成",
] as const;

const FACTORY_STL_CREATED_AT = "2026-08-29T12:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に製造DX 1 件を保持。
 */
export const MOCK_FACTORY_STL_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-factory-stl-gemini-001",
    title:
      "【製造DX】方眼紙スケッチ✕Gemini Visionによる手書き図面からの即時STL生成",
    summary: [
      "方眼紙に手書きした2Dスケッチ・寸法文字をPWAカメラで認識し、",
      "Gemini Vision APIがOpenSCAD/3Dパラメータを抽出。",
      "ブラウザ上でThree.jsプレビュー後、ワンタップでSTLを出力して現場特化ブラケットを即時3Dプリント。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#AI_Vision",
      "#GeminiAPI",
      "#手書き図面DX",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: FACTORY_STL_CREATED_AT,
    body: [
      "【現場フロー】",
      "方眼紙に手書きした 2D スケッチと寸法文字を",
      "PWA カメラ（capture=environment）で撮影する。",
      "アルバム取込も可。暗い現場でも白ベース UI で",
      "プレビュー確認し、解析へ進む。",
      "",
      "【Gemini Vision 抽出】",
      "Gemini Vision API が外形・穴位置・板厚・ねじ径",
      "などから OpenSCAD / 3D パラメータを構造化する。",
      "失敗時はルールベース寸法テンプレへフォールバック。",
      "",
      "【Three.js → STL】",
      "ブラウザ上で Three.js プレビュー後、ワンタップで",
      "STL を出力。現場特化ブラケット・IoT ボックスを",
      "即時 3D プリントし、設計〜施工を短縮する。",
    ].join("\n"),
  },
];

/** 製造DX・Revopoint スキャン（末尾追記） */
export const REVOPOINT_SCAN_KNOWLEDGE_TITLES = [
  "【製造DX】Revopoint MINI 2連携・PWA上での3Dスキャンデータ管理とリバースエンジニアリング",
] as const;

const REVOPOINT_SCAN_CREATED_AT = "2026-08-29T13:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に Revopoint 1 件を保持。
 */
export const MOCK_REVOPOINT_SCAN_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-revopoint-mini2-scan-001",
    title:
      "【製造DX】Revopoint MINI 2連携・PWA上での3Dスキャンデータ管理とリバースエンジニアリング",
    summary: [
      "Revopoint MINI 2（最高0.02mm精度）でスキャンしたSTL/OBJ/PLYファイルを",
      "PWAのThree.jsビューアーで即時展開。",
      "現場パーツの3D寸法計測、干渉確認、オンデマンド3Dプリント出力を一元管理。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#Revopoint",
      "#3Dスキャナー",
      "#ThreeJS",
      "#リバースエンジニアリング",
      "#現場DX",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: REVOPOINT_SCAN_CREATED_AT,
    body: [
      "【スキャン取込】",
      "Revopoint MINI 2（最高 0.02mm 精度）で取得した",
      "STL / OBJ / PLY を PWA へアップロードする。",
      "物件・案件カードに紐づけ、テナント単位で保管する。",
      "",
      "【Three.js ビューアー】",
      "ブラウザ上で即時展開し、回転・ピンチ拡大・断面",
      "表示で現場パーツを確認する。白ベース×navy UI で",
      "屋外でも寸法計測・干渉確認をワンタップ操作する。",
      "",
      "【リバース〜造形】",
      "計測結果から補修ブラケット等を再設計し、",
      "オンデマンド 3D プリントへ出力する。設計・施工・",
      "保守を同一 PWA で一元管理する。",
    ].join("\n"),
  },
];

/** 製造DX・3Dハイブリッド保存（末尾追記） */
export const HYBRID_3D_STORE_KNOWLEDGE_TITLES = [
  "【製造DX】PWA 3Dモジュール運用フローとQNAP/IndexedDBハイブリッド保存設計",
] as const;

const HYBRID_3D_STORE_CREATED_AT = "2026-08-29T14:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾にハイブリッド保存 1 件を保持。
 */
export const MOCK_HYBRID_3D_STORE_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-3d-hybrid-store-001",
    title:
      "【製造DX】PWA 3Dモジュール運用フローとQNAP/IndexedDBハイブリッド保存設計",
    summary: [
      "方眼紙AI生成・Revopointスキャン・パラメトリック調整の3DデータをPWA（Three.js）で一元プレビュー。",
      "端末内IndexedDB（オフライン対応）、ConoHa VPS（Webメタ共有）、",
      "社内QNAP NAS（大容量点群・マスターSTL保管）の3層保存で低コスト・超高速運用を実現。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#QNAP",
      "#IndexedDB",
      "#ThreeJS",
      "#データ保存",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: HYBRID_3D_STORE_CREATED_AT,
    body: [
      "【一元プレビュー】",
      "方眼紙 AI 生成・Revopoint スキャン・パラメトリック",
      "調整の 3D データを PWA（Three.js）で同一ビューアー",
      "に載せる。白ベース×navy で現場でも寸法確認できる。",
      "",
      "【3 層保存】",
      "1) IndexedDB — 端末内キャッシュ・オフライン編集",
      "2) ConoHa VPS — Web メタ（案件 ID・版・サムネ）共有",
      "3) 社内 QNAP NAS — 大容量点群・マスター STL 保管",
      "",
      "【運用効果】",
      "回線とストレージコストを抑えつつ、現場は高速プレビュー、",
      "事務所はマスター資産を NAS で保全するハイブリッド運用。",
    ].join("\n"),
  },
];

/** 製造DX・パラメトリック寸法（末尾追記・2件） */
export const PARAMETRIC_3D_KNOWLEDGE_TITLES = [
  "【製造DX】現場リアルタイム寸法微調整・パラメトリック差分更新アーキテクチャ",
  "【製造DX】3Dパラメトリック寸法ナンバリング・インデックス連動UI設計",
] as const;

const PARAMETRIC_3D_CREATED_AT = "2026-08-29T15:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾にパラメトリック 2 件を保持。
 */
export const MOCK_PARAMETRIC_3D_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-3d-param-delta-001",
    title:
      "【製造DX】現場リアルタイム寸法微調整・パラメトリック差分更新アーキテクチャ",
    summary: [
      "方眼紙AIやスキャンで生成した3Dデータに対し、",
      "PWA上のスライダー数値入力・音声/テキスト差分指示・赤ペン再撮影により",
      "数秒で寸法・穴ピッチ・板厚を再計算。現場での現物合わせ微調整を爆速化する仕組み。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#パラメトリック設計",
      "#現場DX",
      "#寸法調整",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: PARAMETRIC_3D_CREATED_AT,
    body: [
      "【入力チャネル】",
      "PWA 上のスライダー／数値入力、音声・テキストの",
      "差分指示、赤ペン再撮影の 3 経路で寸法を更新する。",
      "白ベース×navy で屋外でもワンタップ操作できる。",
      "",
      "【再計算】",
      "方眼紙 AI・スキャン由来の 3D に対し、穴ピッチ・",
      "板厚・外形を数秒でパラメトリック再計算する。",
      "差分のみをモデルへ適用しフル再生成を避ける。",
      "",
      "【現場効果】",
      "現物合わせの微調整を爆速化し、事務所往復や",
      "再スキャン待ちを削減する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-3d-param-number-001",
    title:
      "【製造DX】3Dパラメトリック寸法ナンバリング・インデックス連動UI設計",
    summary: [
      "3Dモデルおよび手書き図面の変更可能箇所（幅/高さ/穴径/ピッチ/肉厚）に",
      "「①, ②, ③...」の丸数字バッジを自動付与。",
      "画面上のスライダー・音声指示・チャット修正を番号指定で直感操作可能にし、現場間の認識齟齬をゼロにする高速UI/UX。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#UI設計",
      "#現場DX",
      "#ナンバリング",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: PARAMETRIC_3D_CREATED_AT,
    body: [
      "【丸数字バッジ】",
      "幅／高さ／穴径／ピッチ／肉厚など変更可能箇所に",
      "①②③… の丸数字を自動付与する。3D と手書き図面",
      "の両方で同一インデックスを共有する。",
      "",
      "【番号指定操作】",
      "スライダー・音声指示・チャット修正を「②を 0.5mm」",
      "のように番号指定で直感操作する。認識齟齬をゼロに近づける。",
      "",
      "【UI/UX】",
      "現場スマホでも迷わない大きくタップしやすいバッジと",
      "連動パネルで、高速パラメトリック調整を実現する。",
    ].join("\n"),
  },
];

/** 製造DX/保守DX Part1（末尾追記・3件） */
export const FACTORY_DX_PART1_KNOWLEDGE_TITLES = [
  "【製造DX】Revopoint MINI 2連携・PWA 3DビューアーとQNAP/IndexedDBハイブリッド保存",
  "【製造DX】3Dパラメトリック寸法ナンバリング＆現場リアルタイム差分更新UI",
  "【保守DX】QRコード直結によるパーツ即時再出力と現場AR原寸重ね合わせ干渉チェック",
] as const;

const FACTORY_DX_PART1_CREATED_AT = "2026-08-29T16:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に Part1 の 3 件を保持。
 */
export const MOCK_FACTORY_DX_PART1_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-revopoint-hybrid-viewer-001",
    title:
      "【製造DX】Revopoint MINI 2連携・PWA 3DビューアーとQNAP/IndexedDBハイブリッド保存",
    summary: [
      "0.02mm精度の3Dスキャンデータや方眼紙AIデータをThree.jsで一元管理。",
      "端末内IndexedDB（オフライン）、ConoHa VPS（メタ共有）、",
      "社内QNAP NAS（大容量マスター保管）の3層保存で超高速運用。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#Revopoint",
      "#3Dスキャナー",
      "#QNAP",
      "#IndexedDB",
      "#ThreeJS",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: FACTORY_DX_PART1_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-3d-param-number-delta-ui-001",
    title:
      "【製造DX】3Dパラメトリック寸法ナンバリング＆現場リアルタイム差分更新UI",
    summary: [
      "3Dモデルの変更可能箇所（幅/高さ/穴径/ピッチ）に「①, ②, ③...」の丸数字バッジを自動付与。",
      "スライダー操作・音声/テキスト差分・赤ペン再撮影で",
      "即座に寸法を再計算・再出力する高速UI。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#パラメトリック設計",
      "#ナンバリング",
      "#寸法調整",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: FACTORY_DX_PART1_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-qr-ar-reprint-001",
    title:
      "【保守DX】QRコード直結によるパーツ即時再出力と現場AR原寸重ね合わせ干渉チェック",
    summary: [
      "3Dプリント筐体に刻印したQRからPWAのSTL画面をダイレクト起動。",
      "WebXR/ARによる現場原寸重ね合わせ確認と",
      "ワンタップ遠隔3Dプリントで保守手戻りをゼロ化。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#QR連動",
      "#AR干渉チェック",
      "#保守DX",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: FACTORY_DX_PART1_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
];

/** 製造DX Part2（末尾追記・4件） */
export const FACTORY_DX_PART2_KNOWLEDGE_TITLES = [
  "【製造DX】光造形（Saturn 4 Ultra）✕ 大型FDM（K2 Plus）ハイブリッド出力＆結合アセンブリ設計",
  "【製造DX】3Dプリンター稼働監視・PWAプッシュ通知連動と積層強度AIガイド",
  "【盤製造DX】インサートナット熱圧入ポケット・資材コスト試算・耐候性樹脂ナビ",
  "【配線施工DX】インシュロック固定ブリッジ＆端子モールド一体成形設計",
] as const;

const FACTORY_DX_PART2_CREATED_AT = "2026-08-29T17:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に Part2 の 4 件を保持。
 */
export const MOCK_FACTORY_DX_PART2_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-hybrid-sla-fdm-asm-001",
    title:
      "【製造DX】光造形（Saturn 4 Ultra）✕ 大型FDM（K2 Plus）ハイブリッド出力＆結合アセンブリ設計",
    summary: [
      "12K光造形の精密ギヤ・スキャンパーツと大型FDMの耐候性トラスフレームを",
      "PWA上で結合・分解（爆発図）プレビュー。",
      "素材別色分けと結合クリアランス自動調整で異種3Dプリンター混在製造を最適化。",
    ].join("\n"),
    genre: "IOT関連",
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
    pdf_url: null,
    createdAt: FACTORY_DX_PART2_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-printer-push-strength-001",
    title:
      "【製造DX】3Dプリンター稼働監視・PWAプッシュ通知連動と積層強度AIガイド",
    summary: [
      "事務所・車載3Dプリンターの出力完了・異常をPWAへ即時プッシュ通知。",
      "ボルト締め付け・荷重方向からAIが最適なビルド印刷向き（Z軸）を自動判定し、",
      "現場での積層剥離割れを防止。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#3Dプリンター",
      "#PWA通知",
      "#積層強度",
      "#現場DX",
      "#TiSLY_Factory",
    ],
    pdf_url: null,
    createdAt: FACTORY_DX_PART2_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
  {
    id: "kn-seed-insert-nut-cost-resin-001",
    title:
      "【盤製造DX】インサートナット熱圧入ポケット・資材コスト試算・耐候性樹脂ナビ",
    summary: [
      "真鍮インサートナット（M3/M4）用熱圧入下穴を自動設計。",
      "樹脂使用量（g）・原価・印刷時間をリアルタイム試算し、",
      "設置環境に応じた耐候性樹脂（ASA/PETG/CF）を自動選定。",
    ].join("\n"),
    genre: "IOT関連",
    tags: [
      "#インサートナット",
      "#原価計算",
      "#耐候性樹脂",
      "#3Dプリンター",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: FACTORY_DX_PART2_CREATED_AT,
    body: [
      "【熱圧入ポケット】",
      "真鍮インサートナット（M3/M4）用の熱圧入下穴を",
      "パラメトリック自動設計する。",
      "",
      "【原価試算】",
      "樹脂使用量（g）・原価・印刷時間をリアルタイム表示。",
      "",
      "【耐候ナビ】",
      "設置環境に応じ ASA / PETG / CF を自動選定する。",
    ].join("\n"),
  },
  {
    id: "kn-seed-tywrap-terminal-mold-001",
    title:
      "【配線施工DX】インシュロック固定ブリッジ＆端子モールド一体成形設計",
    summary: [
      "ボックス底面・側面に結束バンドを通すタイラップアイを自動配置し、",
      "機械振動による電線抜けを防止。",
      "3Dプリント時に天板・端子番号（DI/RO）を立体モールド成形し、配線施工ミスをゼロ化。",
    ].join("\n"),
    genre: "電気工事",
    tags: [
      "#配線整理",
      "#結束バンド",
      "#立体モールド",
      "#施工品質",
      "#TiSLY_Factory",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: FACTORY_DX_PART2_CREATED_AT,
    body: [
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
    ].join("\n"),
  },
];

/** 防犯DX・赤外線ビーム単管マウント（末尾追記） */
export const IR_BEAM_MOUNT_KNOWLEDGE_TITLES = [
  "【防犯DX】赤外線ビームセンサー用 単管マウント架台＆誤報防止バイザー設計",
] as const;

const IR_BEAM_MOUNT_CREATED_AT = "2026-08-29T18:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に防犯DX 1 件を保持。
 */
export const MOCK_IR_BEAM_MOUNT_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-ir-beam-mount-visor-001",
    title:
      "【防犯DX】赤外線ビームセンサー用 単管マウント架台＆誤報防止バイザー設計",
    summary: [
      "市販の対向型赤外線ビームセンサーに対し、φ48.6単管・フェンス支柱へのダイレクト取付ブラケットおよび",
      "西日・積雪誤報を防ぐロングサンバイザーを3Dプリント設計。",
      "光軸微調整機構と配線ボックスを一体化し、外構セキュリティの施工工数を半減。",
    ].join("\n"),
    genre: "セキュリティー",
    tags: [
      "#赤外線ビーム",
      "#防犯設備",
      "#単管マウント",
      "#誤報防止",
      "#3Dプリンター",
      "#TiSLY_Security",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: IR_BEAM_MOUNT_CREATED_AT,
    body: [
      "【単管ダイレクト取付】",
      "市販の対向型赤外線ビームセンサー向けに、",
      "φ48.6 単管・フェンス支柱へ直接固定する",
      "3D プリントブラケットを設計する。",
      "",
      "【誤報防止バイザー】",
      "西日・積雪による誤報を抑えるロングサンバイザーを",
      "一体造形。光軸微調整機構と配線ボックスも同梱する。",
      "",
      "【施工効果】",
      "外構セキュリティの取付・調整工数を半減し、",
      "白ベース×navy の PWA で寸法・STL を現場共有する。",
    ].join("\n"),
  },
];

/** 製品化DX・RJ45ビームハウジング（末尾追記） */
export const RJ45_BEAM_HOUSING_KNOWLEDGE_TITLES = [
  "【製品化DX】TiSLYオリジナル・ポール＆壁面両対応RJ45ビームセンサーハウジング設計",
] as const;

const RJ45_BEAM_HOUSING_CREATED_AT = "2026-08-29T22:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に製品化DX 1 件を保持。
 */
export const MOCK_RJ45_BEAM_HOUSING_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-rj45-beam-housing-001",
    title:
      "【製品化DX】TiSLYオリジナル・ポール＆壁面両対応RJ45ビームセンサーハウジング設計",
    summary: [
      "市販ビームセンサーをTiSLYブランド製品として再定義するカスタム筐体。",
      "φ48.6単管・支柱用R溝（ステンレスバンド/Uボルト対応）と壁面用四隅ビス穴を一体化した万能ベースプレートを設計。",
      "RJ45プラグ＆プレイ基板とブランドロゴモールドを内蔵し、施工工数を半減させつつ高付加価値化を実現。",
    ].join("\n"),
    genre: "セキュリティー",
    tags: [
      "#自社ブランド化",
      "#ビームセンサー",
      "#単管マウント",
      "#壁面取付",
      "#RJ45",
      "#TiSLY_Security",
      "#PWA",
    ],
    pdf_url: null,
    createdAt: RJ45_BEAM_HOUSING_CREATED_AT,
    body: [
      "【万能ベースプレート】",
      "φ48.6 単管・支柱用 R 溝を設け、",
      "ステンレスバンド／U ボルト取付に対応。",
      "壁面用の四隅ビス穴も同一プレートに一体化する。",
      "",
      "【RJ45 プラグ＆プレイ】",
      "市販ビームセンサーを TiSLY ブランド筐体へ再定義。",
      "RJ45 基板とブランドロゴモールドを内蔵し、",
      "配線・取付の施工工数を半減する。",
      "",
      "【高付加価値化】",
      "ポール／壁面の両対応で現場選択を一本化し、",
      "白ベース×navy の PWA で寸法・STL を共有する。",
    ].join("\n"),
  },
];

/** 施工DX・スマートインターホン（末尾追記） */
export const SMART_INTERCOM_KNOWLEDGE_TITLES = [
  "【施工DX】スマートインターホン（TD-SM5030CT-BSH）PWA応答・電気錠遠隔解錠連携仕様",
] as const;

const SMART_INTERCOM_CREATED_AT = "2026-08-30T07:00:00.000Z";

/**
 * Knowledge モジュール向けモックカード。
 * 既存配列は改変せず、末尾に施工DX 1 件を保持。
 */
export const MOCK_SMART_INTERCOM_ITEMS: KnowledgeItem[] = [
  {
    id: "kn-seed-smart-intercom-td-sm5030-001",
    title:
      "【施工DX】スマートインターホン（TD-SM5030CT-BSH）PWA応答・電気錠遠隔解錠連携仕様",
    summary: [
      "アイリスオーヤマ製Wi-Fiドアホン（TD-SM5030CT-BSH）の呼出移報信号を親機（RP2350）のDI端子またはクラウドAPIで検知。",
      "TiSLY PWA（白ベース×navy UI）上へリアルタイムに来客ポップアップを表示し、ワンタップ通話起動リンク（HomeLink連携）および内蔵リレー（CH1）によるスマート電気錠の遠隔解錠操作を一元提供。",
    ].join("\n"),
    genre: "セキュリティー",
    tags: [
      "#スマートドアホン",
      "#PWA来客応答",
      "#電気錠解錠",
      "#RP2350",
      "#リレー連動",
      "#TiSLY_Security",
    ],
    pdf_url: null,
    createdAt: SMART_INTERCOM_CREATED_AT,
    body: [
      "【呼出検知】",
      "アイリスオーヤマ TD-SM5030CT-BSH の呼出移報を",
      "親機 RP2350 の DI 端子またはクラウド API で検知する。",
      "",
      "【PWA 来客応答】",
      "白ベース×navy の TiSLY PWA にリアルタイムポップアップを表示。",
      "ワンタップで HomeLink（homelink://）通話を起動する。",
      "",
      "【電気錠遠隔解錠】",
      "内蔵リレー CH1 を約 1 秒キックし、",
      "スマート電気錠を遠隔解錠。設計・施工・月額監視を一元化する。",
    ].join("\n"),
  },
];
