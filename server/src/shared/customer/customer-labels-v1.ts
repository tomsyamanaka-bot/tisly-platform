/**
 * お客様向け表示文言 — React Native 流用前提（DOM 非依存）
 */

export const CUSTOMER_SYSTEM_STATUS_V1 = {
  normal: { emoji: "🟢", label: "正常に動いています", short: "正常" },
  checking: { emoji: "🟡", label: "確認中です", short: "確認中" },
  warning: { emoji: "🟠", label: "注意があります", short: "注意があります" },
  alert: { emoji: "🔴", label: "異常があります", short: "異常があります" },
} as const;

export type CustomerSystemStatusKeyV1 = keyof typeof CUSTOMER_SYSTEM_STATUS_V1;

export const CUSTOMER_SENSOR_STATUS_V1 = {
  normal: "正常",
  warning: "注意",
  alert: "警報",
  offline: "確認中",
} as const;

/** 連絡ボタン共通ラベル */
export const CUSTOMER_CONTACT_LABEL_V1 = "トムズへ連絡";

export const CUSTOMER_HOME_CARDS_V1 = [
  { id: "camera", emoji: "📷", label: "カメラを見る", view: "camera" },
  { id: "alerts", emoji: "🚨", label: "警報履歴", view: "alerts" },
  { id: "notifications", emoji: "🔔", label: "通知履歴", view: "notifications" },
  { id: "documents", emoji: "📄", label: "書類を見る", section: "documents" },
  { id: "maintenance", emoji: "🔧", label: "点検・保守情報", section: "maintenance" },
  { id: "contact", emoji: "📞", label: CUSTOMER_CONTACT_LABEL_V1, section: "contact" },
] as const;

/** /customer DOM・API に出してはいけない語（検査用） */
export const CUSTOMER_FORBIDDEN_WORDS_V1 = [
  "MQTT",
  "WS",
  "QNAP",
  "Mock",
  "Gmail mock",
  "PDF puppeteer",
  "App Hub",
  "管理",
  "Map Editor",
  "施工",
  "保守PWA",
  "顧客コード",
  "customerCode",
  "shareId",
  "projectId",
  "API",
  "debug",
  "route-health",
  "PRO Remote",
  "portal",
  "remote",
  "mock",
  "sync",
  "customer code",
  "dashboard",
  "technical",
  "原価",
  "粗利",
  "社内メモ",
  "deviceId",
  "mqtt",
  "topic",
  "JSON",
] as const;

export const CUSTOMER_PAGE_TITLE_V1 = "TiSLY お客様ページ";

/** 物件一覧カードのタップ誘導 */
export const CUSTOMER_PROPERTY_TAP_HINT_V1 = "▶ タップして詳細を見る";

/** ホーム画面セクション見出し */
export const CUSTOMER_HOME_LABELS_V1 = {
  currentStatus: "現在の状態",
  lastChecked: "最終確認",
} as const;

/** 監視画面セクション見出し */
export const CUSTOMER_MONITORING_LABELS_V1 = {
  pageTitle: "見守り",
  sensorStatus: "センサー状態",
  lastDetection: "最終確認",
  alertHistory: "警報履歴",
  notificationHistory: "通知履歴",
  allClear: "現在異常はありません",
} as const;

/** 資料ページセクション見出し */
export const CUSTOMER_PROJECT_LABELS_V1 = {
  pageTitle: "資料",
  documents: "書類一覧",
  photos: "工事写真",
  inspectionRecords: "点検記録",
  workName: "工事名",
} as const;

/** 物件一覧ページ */
export const CUSTOMER_LIST_LABELS_V1 = {
  pageTitle: "物件一覧",
  subtitle: "ご契約中の物件",
} as const;

/** 監視画面で表示してはいけない技術語（検査用） */
export const CUSTOMER_MONITORING_FORBIDDEN_DISPLAY_V1 = [
  "device",
  "sensorId",
  "topic",
  "mqtt",
  "statusCode",
] as const;

export function formatCustomerLastCheckedV1(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatCustomerEventTimeV1(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
