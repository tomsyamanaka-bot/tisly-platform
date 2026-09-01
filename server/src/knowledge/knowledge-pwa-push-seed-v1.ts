/**
 * PWA Web Push 通知登録バー復旧ナレッジ
 * 既存データ保護のうえ末尾追記
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

export interface PwaWebPushModuleSeedItemV1 {
  id: string;
  title: string;
  summary: string;
  body: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  createdAt: string;
}

export const PWA_WEB_PUSH_MODULE_SEED_IDS = [
  "kn-seed-pwa-web-push-register-001",
] as const;

export const PWA_WEB_PUSH_CARD_IDS = [
  "PWA-WEB-PUSH-REGISTER-001",
] as const;

const SEED_CREATED_AT = "2026-09-01T05:00:00.000Z";
const SEED_UPDATED_AT = "2026-09-01";

type Def = {
  moduleId: (typeof PWA_WEB_PUSH_MODULE_SEED_IDS)[number];
  cardId: (typeof PWA_WEB_PUSH_CARD_IDS)[number];
  title: string;
  tags: string[];
  summary: string;
  body: string;
  genre: string;
  category: string;
};

const PUSH_BODY = [
  "【PWA カード一覧ヘッダー UI】",
  "未登録: 🔕「プッシュ通知を有効化する」（navy 枠）。",
  "登録済: 🔔「通知受信中（登録済み）」＋テスト送信。",
  "",
  "【購読フロー】",
  "Service Worker 登録 → VAPID 公開鍵取得 →",
  "Notification.requestPermission → PushManager.subscribe →",
  "POST /api/notifications/subscribe（userId=home-security）。",
  "",
  "【テスト通知】",
  "POST /api/security-floor/v1/test-notify で",
  "玄関インターホン呼出・ミリ波検知の模擬Pushを送信。",
  "",
  "【配置画面】",
  "App Hub（/app）カード一覧上部 · TiSLY HOME · 各拠点PWA。",
  "iOS はホーム画面追加した PWA のみ Web Push 対応。",
].join("\n");

const DEFS: Def[] = [
  {
    moduleId: "kn-seed-pwa-web-push-register-001",
    cardId: "PWA-WEB-PUSH-REGISTER-001",
    title:
      "【PWA機能】Web Push通知登録ボタン・Service Worker購読フロー復旧仕様",
    tags: ["#PWA", "#WebPush", "#通知登録", "#ServiceWorker", "#TiSLY_HOME"],
    genre: "IOT関連",
    category: "IOT関連",
    summary: [
      "PWAカード一覧画面からのワンタップ通知許諾、",
      "VAPID公開鍵連携、来客・防犯アラートの",
      "バックグラウンド受信仕様。",
    ].join("\n"),
    body: PUSH_BODY,
  },
];

export function getPwaWebPushModuleSeedItemsV1(): PwaWebPushModuleSeedItemV1[] {
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

export function getPwaWebPushCardSeedInputsV1(): KnowledgeCardInputV1[] {
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

export function seedPwaWebPushKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getPwaWebPushCardSeedInputsV1()) {
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
  const missingInIndex = PWA_WEB_PUSH_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missingInIndex) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}
