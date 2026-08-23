export type NotificationChannel = "web_push" | "discord" | "email" | "line" | "telegram" | "sms";

export type EventSeverity = "info" | "warning" | "alarm" | "critical";

export interface TislyEvent {
  id?: string;
  tenantId?: string;
  siteId?: string;
  sourceType?: string;
  deviceId: string;
  eventType: string;
  severity?: EventSeverity;
  zone?: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  eventType: string;
  deviceId?: string;
  url?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

/** Web Push 1 購読あたりの送信試行結果（デバッグ / test-notify 用） */
export interface WebPushAttemptResult {
  id: string;
  endpointTail: string;
  endpointHost: string;
  success: boolean;
  statusCode?: number;
  statusLabel: string;
  error?: string;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  /** 送信成功件数（web_push） */
  sent?: number;
  /** 試行した購読数（web_push） */
  attempted?: number;
  /** 各購読への送信結果（web_push） */
  attempts?: WebPushAttemptResult[];
}
