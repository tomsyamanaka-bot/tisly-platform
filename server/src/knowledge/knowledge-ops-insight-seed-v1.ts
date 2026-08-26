/**
 * TiSLY 運用知見ナレッジ追記
 * （センサー遅延・デバウンス・3D UI・
 *  ハートビート警戒・ブランドエンブレム）
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

export interface OpsInsightModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const OPS_INSIGHT_MODULE_SEED_IDS = [
  "kn-seed-sensor-delay-design-001",
  "kn-seed-radar-debounce-100ms-001",
  "kn-seed-ui-isometric-3d-001",
  "kn-seed-rp2350-heartbeat-sched-001",
  "kn-seed-brand-shield-emblem-001",
] as const;

export const OPS_INSIGHT_CARD_IDS = [
  "OPS-SENSOR-DELAY-001",
  "OPS-RADAR-DEBOUNCE-001",
  "OPS-UI-ISOMETRIC-3D-001",
  "OPS-RP2350-HEARTBEAT-001",
  "OPS-BRAND-SHIELD-001",
] as const;

const SEED_CREATED_AT = "2026-08-26T00:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-26";

type OpsInsightSeedDef = {
  moduleId: (typeof OPS_INSIGHT_MODULE_SEED_IDS)[number];
  cardId: (typeof OPS_INSIGHT_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const SENSOR_DELAY_BODY = [
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
].join("\n");

const RADAR_DEBOUNCE_BODY = [
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
].join("\n");

const ISOMETRIC_3D_BODY = [
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
].join("\n");

const HEARTBEAT_BODY = [
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
].join("\n");

const BRAND_SHIELD_BODY = [
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
].join("\n");

const DEFS: OpsInsightSeedDef[] = [
  {
    moduleId: "kn-seed-sensor-delay-design-001",
    cardId: "OPS-SENSOR-DELAY-001",
    title:
      "【センサー・設計】産業・防犯用センサーの応答速度とソフトウェアディレイ設計基準",
    tags: ["#Sensor", "#RP2350", "#Delay", "#Hardware"],
    genre: "IoT",
    category: "IOT関連",
    summary: [
      "物理現象・化学反応に応じた時定数（pH: 10〜30秒、水位: 3秒、CT平滑化: 1〜3秒）。",
      "赤外線ビーム（50〜100ms）やミリ波（100ms）の応答特性。",
      "外乱ノイズ遮断と誤報ゼロを実現するマイコン側の遅延確定ロジック。",
    ].join("\n"),
    body: SENSOR_DELAY_BODY,
  },
  {
    moduleId: "kn-seed-radar-debounce-100ms-001",
    cardId: "OPS-RADAR-DEBOUNCE-001",
    title:
      "【防犯・施工】人感・ミリ波センサーのデバウンス黄金比（100ms）と草木誤検知防止",
    tags: ["#Security", "#Radar", "#LD2410", "#FalseAlarm"],
    genre: "セキュリティー",
    category: "防犯カメラ",
    summary: [
      "歩行速度（時速4km=28cm/0.25秒）と早歩き（時速6km）の通過パルス幅評価。",
      "50msでは風による草木揺れを拾うリスクがあり、現場では100ms〜150msが最適解。",
      "レーダーの距離ゲート調整（HLKRadarTool）と床上70〜100cm設置による物理防犯施工。",
    ].join("\n"),
    body: RADAR_DEBOUNCE_BODY,
  },
  {
    moduleId: "kn-seed-ui-isometric-3d-001",
    cardId: "OPS-UI-ISOMETRIC-3D-001",
    title:
      "【UI/UX・3D】お掃除ロボット風 3Dアイソメトリック間取り図の視認性・操作性設計",
    tags: ["#3D", "#Isometric", "#ThreeJS", "#UIUX"],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "白い立体間仕切り壁（ウォールリブ）と部屋別カラー床塗り分け（オリーブ/グレー等）。",
      "視界を邪魔しない半透明白カプセル型ミニバッジ（9〜10px）と独立階層ボタン。",
      "ドラッグ回転・ピンチ拡大・2本指パン移動のスムーズな操作イベント分離。",
    ].join("\n"),
    body: ISOMETRIC_3D_BODY,
  },
  {
    moduleId: "kn-seed-rp2350-heartbeat-sched-001",
    cardId: "OPS-RP2350-HEARTBEAT-001",
    title:
      "【エッジ・運用】RP2350のハートビート5分周期化とタイムスケジュール警戒システム",
    tags: ["#RP2350", "#Heartbeat", "#Scheduler", "#Security"],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "常時負荷を抑える300秒（5分）ハートビートと10〜15分しきい値での生存監視。",
      "「夜間のみ」固定から、開始・終了時刻を遠隔設定できる時間指定警戒への進化。",
      "昼間（指定時間外）はライトを消灯しWeb Push/ログのみ記録する省エネ防犯連動。",
    ].join("\n"),
    body: HEARTBEAT_BODY,
  },
  {
    moduleId: "kn-seed-brand-shield-emblem-001",
    cardId: "OPS-BRAND-SHIELD-001",
    title:
      "【ブランド・アセット】TiSLY公式立体シールドエンブレムロゴの規格とPWA統一配置",
    tags: ["#Branding", "#Logo", "#TiSLY", "#Asset"],
    genre: "IOT関連",
    category: "その他",
    summary: [
      "青い立体多面体シールド（盾）を基調とした公式エンブレムの策定。",
      "ヘッダーアイコン（高さ32〜40px）、PWAアプリアイコン、ファビコンへの展開。",
      "白ベース×ネイビー基調のプロ向けUIと調和する高解像度アセット管理。",
    ].join("\n"),
    body: BRAND_SHIELD_BODY,
  },
];

export function getOpsInsightModuleSeedItemsV1(): OpsInsightModuleSeedItemV1[] {
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

export function getOpsInsightCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedOpsInsightKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getOpsInsightCardSeedInputsV1()) {
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
  const missingInIndex = OPS_INSIGHT_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
