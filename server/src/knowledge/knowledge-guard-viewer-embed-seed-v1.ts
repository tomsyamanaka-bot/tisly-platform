/**
 * Guard Viewer / EZCloud 共有リンク埋め込み
 * ナレッジ（既存保護・末尾追記）
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

export interface GuardViewerEmbedModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const GUARD_VIEWER_EMBED_MODULE_SEED_IDS = [
  "kn-seed-guard-viewer-ezcloud-embed-001",
] as const;

export const GUARD_VIEWER_EMBED_CARD_IDS = [
  "CAM-GUARD-VIEWER-EZCLOUD-EMBED-001",
] as const;

const SEED_CREATED_AT = "2026-09-07T12:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-07";

const TITLE =
  "【防犯カメラ】Guard Viewer（EZCloud）公式共有リンクを活用したポート開放不要のPWAインライン埋め込み仕様";

const TAGS = [
  "#防犯カメラ",
  "#GuardViewer",
  "#EZCloud",
  "#PWA埋め込み",
  "#ポート開放不要",
  "#TiSLY_Security",
];

const SUMMARY = [
  "NVR側のP2Pクラウド機能から発行される共有WebプレビューURLを",
  "PWAへiframe/Webプレイヤーとして統合。ルーターのポート開放や",
  "ローカル中継サーバーなしで完全遠隔ライブ映像を実現する",
  "省力化アーキテクチャ。",
].join("");

const BODY = [
  "【方法A · クラウド共有埋め込み】",
  "Guard Viewer / EZCloud で発行した共有プレビュー URL を",
  "テナント bindings.cloudStreamUrl（別名 shareUrl）へ登録。",
  "顧客 PWA は 16:9 iframe / HLS（.m3u8）でインライン再生。",
  "",
  "【メリット】",
  "· ルーターのポート開放が不要",
  "· WebRTC 中継サーバー不要",
  "· 社内 /app から URL をコピペ即時反映",
  "",
  "【未設定時】",
  "案内文と Guard Viewer / EZCloud アプリ起動フォールバックを表示。",
  "",
  "【台帳】",
  "docs/CUSTOMER_DEVICES.md · TOYOSHIMA001 §2.6",
].join("\n");

type Def = {
  moduleId: (typeof GUARD_VIEWER_EMBED_MODULE_SEED_IDS)[number];
  cardId: (typeof GUARD_VIEWER_EMBED_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-guard-viewer-ezcloud-embed-001",
    cardId: "CAM-GUARD-VIEWER-EZCLOUD-EMBED-001",
    title: TITLE,
    tags: TAGS,
    genre: "防犯カメラ",
    category: "防犯カメラ",
    summary: SUMMARY,
    body: BODY,
  },
];

export function getGuardViewerEmbedModuleSeedItemsV1(): GuardViewerEmbedModuleSeedItemV1[] {
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

export function getGuardViewerEmbedCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedGuardViewerEmbedKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getGuardViewerEmbedCardSeedInputsV1()) {
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
  const missing = GUARD_VIEWER_EMBED_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
