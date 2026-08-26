/**
 * 防犯・映像・施工ナレッジ追記
 * （WebRTC配信・NVR/RTSP・200V PoE・
 *  ミリ波見守り・ガスパルス見守り）
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

export interface SecurityStreamModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const SECURITY_STREAM_MODULE_SEED_IDS = [
  "kn-seed-cam-webrtc-hybrid-001",
  "kn-seed-nvr-hview-rtsp-001",
  "kn-seed-poe-200v-hub-001",
  "kn-seed-radar-care-privacy-001",
  "kn-seed-gas-pulse-subsc-001",
] as const;

export const SECURITY_STREAM_CARD_IDS = [
  "CAM-WEBRTC-HYBRID-001",
  "NVR-HVIEW-RTSP-001",
  "POE-200V-HUB-001",
  "RADAR-CARE-PRIVACY-001",
  "GAS-PULSE-SUBSC-001",
] as const;

const SEED_CREATED_AT = "2026-08-26T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-08-26";

type SecurityStreamSeedDef = {
  moduleId: (typeof SECURITY_STREAM_MODULE_SEED_IDS)[number];
  cardId: (typeof SECURITY_STREAM_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const WEBRTC_BODY = [
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
].join("\n");

const NVR_BODY = [
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
].join("\n");

const POE_BODY = [
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
].join("\n");

const CARE_BODY = [
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
].join("\n");

const GAS_SUBSC_BODY = [
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
].join("\n");

const DEFS: SecurityStreamSeedDef[] = [
  {
    moduleId: "kn-seed-cam-webrtc-hybrid-001",
    cardId: "CAM-WEBRTC-HYBRID-001",
    title:
      "【防犯・映像配信】PWA（WebRTC）とネイティブアプリにおける防犯カメラストリーミング比較設計",
    tags: [
      "#Security",
      "#Camera",
      "#Streaming",
      "#WebRTC",
      "#PWA",
      "#NativeApp",
    ],
    genre: "防犯カメラ",
    category: "防犯カメラ",
    summary:
      "PWAでのRTSP→WebRTC/HLS変換配信（低遅延・即時性）と、ストアアプリでのネイティブデコード（高負荷マルチ画面・PiP常時監視）の違いとTiSLYにおけるハイブリッド運用指針。",
    body: WEBRTC_BODY,
  },
  {
    moduleId: "kn-seed-nvr-hview-rtsp-001",
    cardId: "NVR-HVIEW-RTSP-001",
    title:
      "【防犯・NVR】H.View製NVRおよびマルチメーカーIPカメラのRTSP/サブストリーム統合",
    tags: ["#Security", "#Camera", "#NVR", "#RTSP", "#HView"],
    genre: "防犯カメラ",
    category: "防犯カメラ",
    summary:
      "H.ViewやReolink等のNVRからRTSPサブストリーム（例: /unicast/c1/s1/live）を抽出し、PWA上で軽量・低遅延に同時マルチカメラ表示を行う手法。",
    body: NVR_BODY,
  },
  {
    moduleId: "kn-seed-poe-200v-hub-001",
    cardId: "POE-200V-HUB-001",
    title:
      "【電源・施工】単相200V環境からのマルチ電圧（100-240V）PoEハブ給電ハック",
    tags: ["#Electrical", "#PoE", "#200V", "#Wiring"],
    genre: "電気工事",
    category: "電気工事",
    summary:
      "200V電源から直接PoEスイッチ（TL-SG1005P等）へ給電し、LANケーブル1本でカメラ・RP2350・センサーへ一括送電する省配線施工。",
    body: POE_BODY,
  },
  {
    moduleId: "kn-seed-radar-care-privacy-001",
    cardId: "RADAR-CARE-PRIVACY-001",
    title:
      "【見守り・センサー】ミリ波レーダー（HLK-LD2410B/LD2450）によるプライバシー保護型安否確認",
    tags: ["#Radar", "#Care", "#RP2350", "#Privacy"],
    genre: "IOT関連",
    category: "IOT関連",
    summary:
      "カメラを置けない居室・浴室にミリ波レーダーを露出ボックス裏へ隠蔽設置し、RP2350のDI/UARTで微細呼吸・動線を検出するハック。",
    body: CARE_BODY,
  },
  {
    moduleId: "kn-seed-gas-pulse-subsc-001",
    cardId: "GAS-PULSE-SUBSC-001",
    title:
      "【住設・サブスク】ガスメーターパルス（DT/SG）直結による自動検針＆24時間見守り",
    tags: ["#Gas", "#Pulse", "#Subsc", "#PWA"],
    genre: "IOT関連",
    category: "IOT関連",
    summary:
      "ガスメーターの無電圧パルスをRP2350で読み取り、月1〜3GBの格安SIM経由で検針・異常遮断・生活反応をPWAへ即時連携する低コスト運用。",
    body: GAS_SUBSC_BODY,
  },
];

export function getSecurityStreamModuleSeedItemsV1(): SecurityStreamModuleSeedItemV1[] {
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

export function getSecurityStreamCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedSecurityStreamKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getSecurityStreamCardSeedInputsV1()) {
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
  const missingInIndex = SECURITY_STREAM_CARD_IDS.some(
    (id) => !indexed.has(id)
  );
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
