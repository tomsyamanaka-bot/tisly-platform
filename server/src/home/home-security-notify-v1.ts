/**
 * TiSLY HOME — 重要度別 Web Push 通知 v1
 *
 * DI1/DI2 検知を段階侵入ルールに従い
 * ログ記録・Push 配信する。
 *
 * ① DI1 単独 → 警戒通知
 * ② DI1→DI2（perimeter 内）→ 緊急通知
 * ③ DI2 単独 → サイレント（Push なし）
 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import type { DeliveryResult } from "../notification/types.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "./home-sites-v1.js";
import {
  getHomeSecurityRulesV1,
  isHomeGuardActiveV1,
  isHomeSecurityPausedV1,
  type HomeSecurityRulesV1,
} from "./home-security-rules-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

const HOME_PUSH_USER_ID = "home-security";

/** 防犯警告アイコン（PWA 共通） */
const SECURITY_ALERT_ICON = "/icons/icon-192.png?v=2003";
const SECURITY_ALERT_BADGE = "/icons/icon-192.png?v=2003";

export type HomeSecurityNotifyPatternV1 = "pattern_a" | "pattern_b" | "pattern_c";

export interface HomeDiInputChangeV1 {
  input: number;
  from: string;
  to: string;
}

export interface HomeSecurityNotifyPolicyRowV1 {
  id: "di1_alone" | "staged_intrusion" | "di2_alone";
  label: string;
  enabled: boolean;
  severity: "warning" | "critical" | "silent";
  description: string;
}

export interface HomeSecurityNotifyPolicyV1 {
  rows: HomeSecurityNotifyPolicyRowV1[];
  perimeterTimeoutSec: number;
}

/** サイト別 DI1 検知時刻（段階侵入判定用） */
const di1DetectedAtMs = new Map<string, number>();

/** テスト用：DI1 検知時刻を任意設定 */
export function setHomeSecurityDi1DetectedAtForTestV1(
  siteId: string,
  atMs: number
): void {
  di1DetectedAtMs.set(siteId, atMs);
}

/** テスト用：段階侵入状態をリセット */
export function resetHomeSecurityNotifyStateV1(siteId?: string): void {
  if (siteId) di1DetectedAtMs.delete(siteId);
  else di1DetectedAtMs.clear();
}

/** UI 表示用：固定通知ポリシー */
export function buildHomeSecurityNotifyPolicyV1(
  rules: HomeSecurityRulesV1
): HomeSecurityNotifyPolicyV1 {
  const sec = rules.perimeterTimeoutSec;
  return {
    perimeterTimeoutSec: sec,
    rows: [
      {
        id: "di1_alone",
        label: "DI1単独：通知ON",
        enabled: true,
        severity: "warning",
        description:
          "外周センサー（DI1）のみ検知時に警戒 Web Push を送信",
      },
      {
        id: "staged_intrusion",
        label: "DI1➔DI2段階侵入：緊急通知ON",
        enabled: true,
        severity: "critical",
        description: `DI1 検知後 ${sec} 秒以内の DI2 で緊急 Push`,
      },
      {
        id: "di2_alone",
        label: "DI2単独：通知OFF（サイレント）",
        enabled: false,
        severity: "silent",
        description:
          "近接センサー単独はログとライトのみ（Push なし）",
      },
    ],
  };
}

function persistHomePushLog(
  eventType: string,
  title: string,
  body: string,
  payload: Record<string, unknown>,
  result: DeliveryResult
): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO notification_logs (
        id, user_id, device_id, event_type, channel,
        title, body, payload_json, status, sent_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      HOME_PUSH_USER_ID,
      HOME_ITABASHI_LIVE_SITE_ID_V1,
      eventType,
      "web_push",
      title,
      body,
      JSON.stringify(payload),
      result.success ? "sent" : "failed",
      result.success ? new Date().toISOString() : null,
      result.error ?? null
    );
  } catch {
    /* テスト環境等 */
  }
}

async function sendHomeSecurityPush(payload: {
  title: string;
  body: string;
  eventType: string;
  url: string;
  severity: "warning" | "critical" | "info";
  data?: Record<string, unknown>;
}): Promise<DeliveryResult> {
  try {
    return await sendWebPush(
      {
        title: payload.title,
        body: payload.body,
        eventType: payload.eventType,
        deviceId: HOME_ITABASHI_LIVE_SITE_ID_V1,
        url: payload.url,
        icon: SECURITY_ALERT_ICON,
        badge: SECURITY_ALERT_BADGE,
        data: {
          ...payload.data,
          severity: payload.severity,
          icon: SECURITY_ALERT_ICON,
          badge: SECURITY_ALERT_BADGE,
        },
      },
      HOME_PUSH_USER_ID
    );
  } catch (err) {
    return {
      channel: "web_push",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function classifyDi2PatternV1(
  siteId: string,
  rules: HomeSecurityRulesV1
): HomeSecurityNotifyPatternV1 {
  const lastDi1 = di1DetectedAtMs.get(siteId);
  if (lastDi1 == null) return "pattern_c";
  const windowMs = rules.perimeterTimeoutSec * 1000;
  if (Date.now() - lastDi1 <= windowMs) return "pattern_b";
  return "pattern_c";
}

function patternLogMessage(
  pattern: HomeSecurityNotifyPatternV1,
  di: 1 | 2
): string {
  if (di === 1) return "外周センサー DI1 検知";
  if (pattern === "pattern_b") {
    return "段階侵入 DI2 検知（DI1 から接近）";
  }
  return "近接センサー DI2 単独検知（サイレント）";
}

function patternLightLogMessage(
  pattern: HomeSecurityNotifyPatternV1,
  rules: HomeSecurityRulesV1
): string {
  if (pattern === "pattern_a") {
    return `防犯ライト点灯（DI1 · ${rules.di1DurationSec}秒）`;
  }
  if (pattern === "pattern_b") {
    return `防犯ライト威嚇（DI2 段階 · ${rules.di2AlertDurationSec}秒）`;
  }
  return `防犯ライト点灯（DI2 単独 · ${rules.di2StandaloneDurationSec}秒）`;
}

async function dispatchPatternPushV1(input: {
  siteId: string;
  pattern: HomeSecurityNotifyPatternV1;
  guardActive: boolean;
}): Promise<boolean> {
  const { siteId, pattern, guardActive } = input;
  const url = `/home-customer-v1.html?siteId=${encodeURIComponent(siteId)}`;

  if (pattern === "pattern_c") {
    console.log(
      `[home-security] DI2 standalone silent site=${siteId}`
    );
    return false;
  }

  if (!guardActive) {
    console.log(
      `[home-security] guard inactive — log only pattern=${pattern}`
    );
    return false;
  }

  if (pattern === "pattern_a") {
    const title = "【TiSLY Security】外周接近を検知";
    const body =
      "遠距離センサー（DI1）が反応しました。24Vライトを点灯中。";
    const result = await sendHomeSecurityPush({
      title,
      body,
      eventType: "home_security_di1_perimeter",
      url,
      severity: "warning",
      data: { di: 1, siteId, pattern },
    });
    persistHomePushLog(
      "home_security_di1_perimeter",
      title,
      body,
      { di: 1, siteId, pattern },
      result
    );
    console.log(
      `[home-security] push DI1 alert success=${result.success}`
    );
    return true;
  }

  const title = "🚨【緊急警報】建物への接近侵入を検知";
  const body =
    "外周に続き建物近接センサー（DI2）が反応しました！" +
    "24V点滅＋100Vライト威嚇中。";
  const result = await sendHomeSecurityPush({
    title,
    body,
    eventType: "home_security_di2_staged_intrusion",
    url,
    severity: "critical",
    data: { di: 2, siteId, pattern, urgency: "critical" },
  });
  persistHomePushLog(
    "home_security_di2_staged_intrusion",
    title,
    body,
    { di: 2, siteId, pattern, severity: "critical" },
    result
  );
  console.log(
    `[home-security] push DI2 critical success=${result.success}`
  );
  return true;
}

async function handleDiRisingEdgeV1(
  siteId: string,
  di: 1 | 2,
  rules: HomeSecurityRulesV1,
  guardActive: boolean
): Promise<{ pattern: HomeSecurityNotifyPatternV1; pushSent: boolean }> {
  let pattern: HomeSecurityNotifyPatternV1;

  if (di === 1) {
    di1DetectedAtMs.set(siteId, Date.now());
    pattern = "pattern_a";
  } else {
    pattern = classifyDi2PatternV1(siteId, rules);
    if (pattern === "pattern_b") {
      di1DetectedAtMs.delete(siteId);
    }
  }

  recordSystemLogV1({
    siteId,
    category: "sensor_alert",
    message: patternLogMessage(pattern, di),
    detail: {
      di,
      input: di,
      pattern,
      guardActive,
      guardMode: rules.guardMode,
    },
    actor: "rp2350",
  });

  recordSystemLogV1({
    siteId,
    category: "light_event",
    message: patternLightLogMessage(pattern, rules),
    detail: {
      di,
      pattern,
      di1LightMode: rules.di1LightMode,
      di2LightMode: rules.di2LightMode,
    },
    actor: "rp2350",
  });

  const pushSent = await dispatchPatternPushV1({
    siteId,
    pattern: di === 1 ? "pattern_a" : pattern,
    guardActive,
  });
  return { pattern: di === 1 ? "pattern_a" : pattern, pushSent };
}

/** RP2350 heartbeat 等から DI 変化を処理 */
export async function processHomeSecurityInputChangesV1(
  siteId: string,
  changes: HomeDiInputChangeV1[]
): Promise<void> {
  const sid = String(siteId ?? HOME_ITABASHI_LIVE_SITE_ID_V1).trim();
  const rules = getHomeSecurityRulesV1(sid);
  const guardActive =
    isHomeGuardActiveV1(rules) && !isHomeSecurityPausedV1(rules);

  for (const change of changes) {
    if (change.to !== "on" || change.from === "on") continue;
    if (change.input !== 1 && change.input !== 2) continue;
    await handleDiRisingEdgeV1(sid, change.input as 1 | 2, rules, guardActive);
  }
}

/** RP2350 からの明示イベント POST 用 */
export async function processHomeSecurityEventV1(input: {
  siteId: string;
  di: number;
  pattern?: string;
}): Promise<{ pattern: HomeSecurityNotifyPatternV1; pushSent: boolean }> {
  const sid = String(input.siteId ?? HOME_ITABASHI_LIVE_SITE_ID_V1).trim();
  const di = Number(input.di);
  if (di !== 1 && di !== 2) {
    throw new Error("di must be 1 or 2");
  }

  const rules = getHomeSecurityRulesV1(sid);
  const guardActive =
    isHomeGuardActiveV1(rules) && !isHomeSecurityPausedV1(rules);

  return handleDiRisingEdgeV1(sid, di as 1 | 2, rules, guardActive);
}
