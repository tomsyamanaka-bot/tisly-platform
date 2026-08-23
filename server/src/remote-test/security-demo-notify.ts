import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import type { DeliveryResult } from "../notification/types.js";
import {
  buildInputNotifyPayload,
  loadSecurityDemoConfig,
} from "./security-demo-config.js";
import { markPushResult, recordSecurityNotification } from "./remote-test-state.js";
import {
  getSecurityMode,
  isArmed,
  isSecurityDemoPushInCooldown,
  markSecurityDemoPushSent,
  recordInputSecurityEvent,
  SECURITY_DEMO_PUSH_COOLDOWN_MS,
  type SecurityMode,
} from "./security-demo-state.js";

const REMOTE_TEST_USER_ID = "remote-test";

/** センサー検知 Push は DI1/DI2 のみ（DI3〜DI8・DO は対象外） */
const PUSH_SENSOR_INPUTS = new Set([1, 2]);

function persistSecurityLog(
  eventType: string,
  title: string,
  body: string,
  payload: Record<string, unknown>,
  result: DeliveryResult
): string {
  const logId = uuid();
  const cfg = loadSecurityDemoConfig();
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO notification_logs (id, user_id, device_id, event_type, channel, title, body, payload_json, status, sent_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      logId,
      REMOTE_TEST_USER_ID,
      cfg.deviceId,
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
    /* DB unavailable in tests */
  }
  return logId;
}

async function sendSecurityPush(
  payload: {
    title: string;
    body: string;
    eventType: string;
    deviceId: string;
    url: string;
    data?: Record<string, unknown>;
  }
): Promise<DeliveryResult> {
  try {
    // DI/警戒イベントは登録済みの全アクティブ端末へ
    return await sendWebPush(payload);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[security-demo] sendWebPush failed:", error);
    return {
      channel: "web_push",
      success: false,
      error,
    };
  }
}

export async function processSecurityInputChanges(
  changes: import("./security-demo-state.js").InputStateChange[]
): Promise<void> {
  for (const change of changes) {
    const event = recordInputSecurityEvent(change);
    console.log(
      `[security-demo] input event DI${change.input} ${change.from}→${change.to} armed=${isArmed()} type=${event.type}`
    );

    if (!isArmed()) {
      console.log("[security-demo] disarmed — eventHistory only, no push");
      continue;
    }

    // Push は DI1/DI2 センサー検知のみ（DO・他 DI はログのみ）
    if (!PUSH_SENSOR_INPUTS.has(change.input)) {
      console.log(
        `[security-demo] DI${change.input} — Push skipped (sensor Push limited to DI1/DI2)`
      );
      continue;
    }

    // クールダウンは検知（ON）連打のみ。OFF/復帰は抑止しない
    if (change.to === "on" && isSecurityDemoPushInCooldown(change.input)) {
      console.log(
        `[security-demo] DI${change.input} — Push suppressed (cooldown ${SECURITY_DEMO_PUSH_COOLDOWN_MS}ms), log only`
      );
      continue;
    }

    const payload = buildInputNotifyPayload(change.input, change.to);
    // 実 Push は home-security-notify（パターン通知）が担当。
    // ここでは remote-test 通知履歴のみ残し、Web Push 二重送信を防ぐ。
    console.log(
      "[security-demo] history only (Web Push via home-security)",
      { title: payload.title, body: payload.body }
    );
    const result: DeliveryResult = {
      channel: "web_push",
      success: true,
      error: undefined,
    };
    if (change.to === "on") {
      markSecurityDemoPushSent(change.input);
    }
    const logId = persistSecurityLog(
      payload.eventType,
      payload.title,
      payload.body,
      { ...payload, pushDelegatedTo: "home_security" },
      result
    );
    recordSecurityNotification(
      {
        kind: "security",
        channel: change.input,
        from: change.from,
        to: change.to,
        title: payload.title,
        body: payload.body,
        eventType: payload.eventType,
      },
      result,
      logId
    );
  }
}

export async function notifySecurityModeChange(mode: SecurityMode): Promise<void> {
  const cfg = loadSecurityDemoConfig();
  const notify = mode === "ARM" ? cfg.armNotify : cfg.disarmNotify;
  const eventType = mode === "ARM" ? "security_armed" : "security_disarmed";
  const payload = {
    title: notify.title,
    body: notify.body,
    eventType,
    deviceId: cfg.deviceId,
    url: "/remote-test",
    data: { kind: "security_mode", mode },
  };

  console.log(`[security-demo] mode change → ${mode}`, notify);
  const result = await sendSecurityPush(payload);
  const logId = persistSecurityLog(eventType, notify.title, notify.body, payload, result);
  recordSecurityNotification(
    {
      kind: mode === "ARM" ? "arm" : "disarm",
      channel: 0,
      from: mode === "ARM" ? "DISARM" : "ARM",
      to: mode,
      title: notify.title,
      body: notify.body,
      eventType,
    },
    result,
    logId
  );
  markPushResult(result.success, result.error);
}

export function getSecurityModeLabel(): SecurityMode {
  return getSecurityMode();
}
