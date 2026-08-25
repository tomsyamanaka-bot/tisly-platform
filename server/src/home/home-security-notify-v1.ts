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
  isHomeNotifyPushEnabledV1,
  isHomeSecurityArmedV1,
  isHomeSecurityPausedV1,
  type HomeNotifyModeV1,
  type HomeSecurityRulesV1,
} from "./home-security-rules-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import { recordHomeDiSecurityAlarmV1 } from "../security-floor/security-floor-soc-v1.js";

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
  /** critical=緊急 / silent=サイレント / off=OFF（旧 warning は critical 相当） */
  severity: "warning" | "critical" | "silent" | "off";
  mode: HomeNotifyModeV1;
  description: string;
}

export interface HomeSecurityNotifyPolicyV1 {
  rows: HomeSecurityNotifyPolicyRowV1[];
  perimeterTimeoutSec: number;
}

/** サイト別 DI1 検知時刻（段階侵入判定用） */
const di1DetectedAtMs = new Map<string, number>();

/** 同一センサー Push クールダウン（ミリ秒）— 連打防止・DB ログは継続 */
export const HOME_SECURITY_PUSH_COOLDOWN_MS = 45_000;

/** siteId:di → 最終 Push 送信時刻 */
const lastDiPushAtMs = new Map<string, number>();

function pushCooldownKey(siteId: string, di: 1 | 2): string {
  return `${siteId}:${di}`;
}

function isDiPushInCooldown(siteId: string, di: 1 | 2): boolean {
  const last = lastDiPushAtMs.get(pushCooldownKey(siteId, di));
  if (last == null) return false;
  return Date.now() - last < HOME_SECURITY_PUSH_COOLDOWN_MS;
}

function markDiPushSent(siteId: string, di: 1 | 2): void {
  lastDiPushAtMs.set(pushCooldownKey(siteId, di), Date.now());
}

/** テスト用：DI1 検知時刻を任意設定 */
export function setHomeSecurityDi1DetectedAtForTestV1(
  siteId: string,
  atMs: number
): void {
  di1DetectedAtMs.set(siteId, atMs);
}

/** テスト用：段階侵入・クールダウン状態をリセット */
export function resetHomeSecurityNotifyStateV1(siteId?: string): void {
  if (siteId) {
    di1DetectedAtMs.delete(siteId);
    lastDiPushAtMs.delete(pushCooldownKey(siteId, 1));
    lastDiPushAtMs.delete(pushCooldownKey(siteId, 2));
  } else {
    di1DetectedAtMs.clear();
    lastDiPushAtMs.clear();
  }
}

/** UI 表示用：通知ポリシー（rules のフラグを反映） */
export function buildHomeSecurityNotifyPolicyV1(
  rules: HomeSecurityRulesV1
): HomeSecurityNotifyPolicyV1 {
  const sec = rules.perimeterTimeoutSec;
  const di1Mode = rules.notifyDi1Mode;
  const stagedMode = rules.notifyStagedMode;
  const di2Mode = rules.notifyDi2Mode;

  const modeMeta = (mode: HomeNotifyModeV1) => {
    if (mode === "critical") {
      return { enabled: true, severity: "critical" as const };
    }
    if (mode === "silent") {
      return { enabled: false, severity: "silent" as const };
    }
    return { enabled: false, severity: "off" as const };
  };

  const di1 = modeMeta(di1Mode);
  const staged = modeMeta(stagedMode);
  const di2 = modeMeta(di2Mode);

  return {
    perimeterTimeoutSec: sec,
    rows: [
      {
        id: "di1_alone",
        label:
          di1Mode === "critical"
            ? "DI1単独：緊急通知ON"
            : di1Mode === "silent"
              ? "DI1単独：サイレント"
              : "DI1単独：OFF",
        enabled: di1.enabled,
        severity: di1.severity,
        mode: di1Mode,
        description:
          di1Mode === "critical"
            ? "駐車場センサー（DI1）のみ検知時に緊急 Web Push を送信"
            : di1Mode === "silent"
              ? "駐車場センサー（DI1）はログとライトのみ（Push なし）"
              : "駐車場センサー（DI1）の Web Push を完全に無効化",
      },
      {
        id: "staged_intrusion",
        label:
          stagedMode === "critical"
            ? "DI1➔DI2段階侵入：緊急通知ON"
            : stagedMode === "silent"
              ? "DI1➔DI2段階侵入：サイレント"
              : "DI1➔DI2段階侵入：OFF",
        enabled: staged.enabled,
        severity: staged.severity,
        mode: stagedMode,
        description:
          stagedMode === "critical"
            ? `駐車場センサー検知後 ${sec} 秒以内のガレージセンサーで緊急 Push`
            : stagedMode === "silent"
              ? `段階侵入はログとライトのみ（${sec} 秒判定は継続）`
              : "段階侵入の Web Push を完全に無効化",
      },
      {
        id: "di2_alone",
        label:
          di2Mode === "critical"
            ? "DI2単独：即時Web Push"
            : di2Mode === "silent"
              ? "DI2単独：サイレント"
              : "DI2単独：OFF",
        enabled: di2.enabled,
        severity: di2.severity,
        mode: di2Mode,
        description:
          di2Mode === "critical"
            ? "ガレージセンサー（DI2）単独でも緊急 Web Push を送信"
            : di2Mode === "silent"
              ? "ガレージセンサー単独はログとライトのみ（Push なし）"
              : "ガレージセンサー単独の Web Push を完全に無効化",
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
    // 登録端末は remote-test / admin-default 等に分かれるため全アクティブへ配信
    return await sendWebPush({
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
    });
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
  if (di === 1) return "駐車場センサー (DI1) 検知";
  if (pattern === "pattern_b") {
    return "段階侵入 ガレージセンサー (DI2) 検知（駐車場から接近）";
  }
  return "ガレージセンサー (DI2) 単独検知（サイレント）";
}

function patternLightLogMessage(
  pattern: HomeSecurityNotifyPatternV1,
  rules: HomeSecurityRulesV1,
  lightsActive: boolean
): string {
  if (!lightsActive) {
    return "防犯ライト点灯スキップ（時間外 · 通知/ログのみ）";
  }
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
  armed: boolean;
  lightsActive: boolean;
  rules: HomeSecurityRulesV1;
  di: 1 | 2;
}): Promise<boolean> {
  const { siteId, pattern, armed, lightsActive, rules, di } = input;
  const url = `/security-v1.html?siteId=${encodeURIComponent(siteId)}`;

  if (!armed) {
    console.log(
      `[home-security] security disarmed — log only pattern=${pattern} site=${siteId}`
    );
    return false;
  }

  /* 時間指定警戒: 窓外は緊急Push抑止（サイレントログのみ） */
  if (
    !lightsActive &&
    (rules.guardMode === "scheduled" || rules.guardMode === "night_only")
  ) {
    console.log(
      `[home-security] outside schedule — silent log only pattern=${pattern} site=${siteId}`
    );
    return false;
  }

  if (isDiPushInCooldown(siteId, di)) {
    console.log(
      `[home-security] DI${di} Push suppressed (cooldown ${HOME_SECURITY_PUSH_COOLDOWN_MS}ms) pattern=${pattern} site=${siteId}`
    );
    return false;
  }

  // DI1 単独：critical 以外は Push しない
  if (pattern === "pattern_a") {
    if (!isHomeNotifyPushEnabledV1(rules.notifyDi1Mode)) {
      console.log(
        `[home-security] DI1 ${rules.notifyDi1Mode} (no push) site=${siteId}`
      );
      return false;
    }
    const title = "🚨【緊急警報】駐車場センサーを検知";
    const body = lightsActive
      ? "駐車場センサー (DI1) が反応しました。外側100V・投光器ライトを点灯中。"
      : "駐車場センサー (DI1) が反応しました（時間外 · ライトは点灯しません）。";
    const result = await sendHomeSecurityPush({
      title,
      body,
      eventType: "home_security_di1_perimeter",
      url,
      severity: "critical",
      data: { di: 1, siteId, pattern, urgency: "critical", click_action: url },
    });
    persistHomePushLog(
      "home_security_di1_perimeter",
      title,
      body,
      { di: 1, siteId, pattern, url, click_action: url },
      result
    );
    markDiPushSent(siteId, 1);
    console.log(
      `[home-security] push DI1 alert success=${result.success} error=${result.error ?? ""}`
    );
    return true;
  }

  // DI2 単独：critical 以外はサイレント / OFF
  if (pattern === "pattern_c") {
    if (!isHomeNotifyPushEnabledV1(rules.notifyDi2Mode)) {
      console.log(
        `[home-security] DI2 standalone ${rules.notifyDi2Mode} site=${siteId}`
      );
      return false;
    }
    const title = "🚨【緊急警報】ガレージセンサーを検知";
    const body = lightsActive
      ? "ガレージセンサー (DI2) が反応しました。防犯ライト威嚇中。"
      : "ガレージセンサー (DI2) が反応しました（時間外 · ライトは点灯しません）。";
    const result = await sendHomeSecurityPush({
      title,
      body,
      eventType: "home_security_di2_instant",
      url,
      severity: "critical",
      data: { di: 2, siteId, pattern, urgency: "critical", click_action: url },
    });
    persistHomePushLog(
      "home_security_di2_instant",
      title,
      body,
      { di: 2, siteId, pattern, severity: "critical", url, click_action: url },
      result
    );
    markDiPushSent(siteId, 2);
    console.log(
      `[home-security] push DI2 instant success=${result.success} error=${result.error ?? ""}`
    );
    return true;
  }

  // DI1→DI2 段階侵入：モードが critical のときのみ緊急 Push
  if (!isHomeNotifyPushEnabledV1(rules.notifyStagedMode)) {
    console.log(
      `[home-security] staged intrusion ${rules.notifyStagedMode} site=${siteId}`
    );
    return false;
  }
  const title = "🚨【緊急警報】駐車場→ガレージの段階侵入を検知";
  const body = lightsActive
    ? "駐車場センサーに続きガレージセンサー (DI2) が反応しました！" +
      "外側100V点滅＋100V投光器ライト威嚇中。"
    : "駐車場センサーに続きガレージセンサー (DI2) が反応しました！" +
      "（時間外 · ライトは点灯しません）";
  const result = await sendHomeSecurityPush({
    title,
    body,
    eventType: "home_security_di2_staged_intrusion",
    url,
    severity: "critical",
    data: { di: 2, siteId, pattern, urgency: "critical", click_action: url },
  });
  persistHomePushLog(
    "home_security_di2_staged_intrusion",
    title,
    body,
    { di: 2, siteId, pattern, severity: "critical", url, click_action: url },
    result
  );
  markDiPushSent(siteId, 2);
  console.log(
    `[home-security] push DI2 critical success=${result.success} error=${result.error ?? ""}`
  );
  return true;
}

async function handleDiRisingEdgeV1(
  siteId: string,
  di: 1 | 2,
  rules: HomeSecurityRulesV1,
  armed: boolean,
  lightsActive: boolean
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

  const resolvedPattern = di === 1 ? "pattern_a" : pattern;
  const sensorMessage = patternLogMessage(resolvedPattern, di);

  recordSystemLogV1({
    siteId,
    category: "sensor_alert",
    message: sensorMessage,
    detail: {
      di,
      input: di,
      pattern: resolvedPattern,
      armed,
      lightsActive,
      guardMode: rules.guardMode,
    },
    actor: "rp2350",
  });

  recordSystemLogV1({
    siteId,
    category: "light_event",
    message: patternLightLogMessage(resolvedPattern, rules, lightsActive),
    detail: {
      di,
      pattern: resolvedPattern,
      lightsActive,
      di1LightMode: rules.di1LightMode,
      di2LightMode: rules.di2LightMode,
    },
    actor: "rp2350",
  });

  // Security Floor 警報画面へ即時反映（ポーリングで UI 同期）
  try {
    recordHomeDiSecurityAlarmV1({
      homeSiteId: siteId,
      di,
      pattern: resolvedPattern,
    });
  } catch (err) {
    console.warn(
      "[home-security] failed to mirror DI alarm to security-floor:",
      err instanceof Error ? err.message : err
    );
  }

  const pushSent = await dispatchPatternPushV1({
    siteId,
    pattern: resolvedPattern,
    armed,
    lightsActive,
    rules,
    di,
  });
  return { pattern: resolvedPattern, pushSent };
}

/** RP2350 heartbeat 等から DI 変化を処理 */
export async function processHomeSecurityInputChangesV1(
  siteId: string,
  changes: HomeDiInputChangeV1[]
): Promise<void> {
  const sid = String(siteId ?? HOME_ITABASHI_LIVE_SITE_ID_V1).trim();
  const rules = getHomeSecurityRulesV1(sid);
  const armed = isHomeSecurityArmedV1(rules);
  const lightsActive = isHomeGuardActiveV1(rules);

  for (const change of changes) {
    if (change.to !== "on" || change.from === "on") continue;
    if (change.input !== 1 && change.input !== 2) continue;
    await handleDiRisingEdgeV1(sid, change.input as 1 | 2, rules, armed, lightsActive);
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
  const armed = isHomeSecurityArmedV1(rules);
  const lightsActive = isHomeGuardActiveV1(rules);

  return handleDiRisingEdgeV1(sid, di as 1 | 2, rules, armed, lightsActive);
}
