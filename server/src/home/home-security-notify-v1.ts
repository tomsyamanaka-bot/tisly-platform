/**
 * TiSLY HOME — 重要度別 Web Push 通知 v1
 *
 * DI1/DI2 検知をルール設定に従い
 * ログ記録・Push 配信する。
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
} from "./home-security-rules-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

const HOME_PUSH_USER_ID = "home-security";

export interface HomeDiInputChangeV1 {
  input: number;
  from: string;
  to: string;
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
        data: payload.data,
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

    const di = change.input;
    const pattern =
      di === 1 ? "pattern_a" : "pattern_b_or_c";

    recordSystemLogV1({
      siteId: sid,
      category: "sensor_alert",
      message:
        di === 1
          ? "外周センサー DI1 検知"
          : "近接センサー DI2 検知（段階侵入）",
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
      siteId: sid,
      category: "light_event",
      message:
        di === 1
          ? `防犯ライト点灯（DI1 · ${rules.di1DurationSec}秒）`
          : `防犯ライト点灯（DI2 · ${rules.di2AlertDurationSec}秒）`,
      detail: {
        di,
        di1LightMode: rules.di1LightMode,
        di2LightMode: rules.di2LightMode,
      },
      actor: "rp2350",
    });

    if (di === 1 && rules.notifyDi1SilentLogOnly) {
      console.log(
        `[home-security] DI1 silent log only site=${sid}`
      );
      continue;
    }

    if (di === 2 && !rules.notifyDi2InstantPush) {
      console.log(
        `[home-security] DI2 push disabled site=${sid}`
      );
      continue;
    }

    if (!guardActive && di === 1) {
      console.log(
        `[home-security] DI1 guard inactive — log only`
      );
      continue;
    }

    const title =
      di === 2
        ? "🚨 近接侵入を検知しました"
        : "⚠️ 外周センサー反応";
    const body =
      di === 2
        ? "玄関付近に接近を検知。すぐに状況を確認してください。"
        : "外周に動きを検知しました（ログ記録）。";

    const result = await sendHomeSecurityPush({
      title,
      body,
      eventType: di === 2 ? "home_security_di2" : "home_security_di1",
      url: `/home-customer-v1.html?siteId=${encodeURIComponent(sid)}`,
      data: { di, siteId: sid, severity: di === 2 ? "critical" : "info" },
    });

    persistHomePushLog(
      di === 2 ? "home_security_di2" : "home_security_di1",
      title,
      body,
      { di, siteId: sid },
      result
    );

    console.log(
      `[home-security] push DI${di} success=${result.success}`
    );
  }
}
