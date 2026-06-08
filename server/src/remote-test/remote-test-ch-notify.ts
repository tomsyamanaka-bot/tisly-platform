import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import type { DeliveryResult } from "../notification/types.js";
import {
  markPushResult,
  recordChStateNotification,
  recordInputStateNotification,
  type ChStateChange,
  type InputStateChange,
} from "./remote-test-state.js";

const REMOTE_TEST_USER_ID = "remote-test";
const REMOTE_TEST_DEVICE_ID = "rp2350-remote-test-01";

function buildChStatePayload(change: ChStateChange) {
  const label = `CH${change.channel} ${change.to.toUpperCase()}`;
  return {
    title: `TiSLY ${label}`,
    body: label,
    eventType: "ch_state_change",
    deviceId: REMOTE_TEST_DEVICE_ID,
    url: "/remote-test",
    data: {
      kind: "ch",
      channel: change.channel,
      from: change.from,
      to: change.to,
    },
  };
}

function buildInputStatePayload(change: InputStateChange) {
  const label = `DI${change.input} ${change.to.toUpperCase()}`;
  return {
    title: `TiSLY ${label}`,
    body: label,
    eventType: "input_state_change",
    deviceId: REMOTE_TEST_DEVICE_ID,
    url: "/remote-test",
    data: {
      kind: "di",
      input: change.input,
      from: change.from,
      to: change.to,
    },
  };
}

function persistNotificationLog(
  change: ChStateChange,
  payload: ReturnType<typeof buildChStatePayload>,
  result: DeliveryResult
): string {
  const logId = uuid();
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO notification_logs (id, user_id, device_id, event_type, channel, title, body, payload_json, status, sent_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      logId,
      REMOTE_TEST_USER_ID,
      REMOTE_TEST_DEVICE_ID,
      payload.eventType,
      "web_push",
      payload.title,
      payload.body,
      JSON.stringify(payload),
      result.success ? "sent" : "failed",
      result.success ? new Date().toISOString() : null,
      result.error ?? null
    );
  } catch {
    /* DB unavailable in tests — in-memory history still recorded */
  }
  return logId;
}

function persistInputNotificationLog(
  change: InputStateChange,
  payload: ReturnType<typeof buildInputStatePayload>,
  result: DeliveryResult
): string {
  const logId = uuid();
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO notification_logs (id, user_id, device_id, event_type, channel, title, body, payload_json, status, sent_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      logId,
      REMOTE_TEST_USER_ID,
      REMOTE_TEST_DEVICE_ID,
      payload.eventType,
      "web_push",
      payload.title,
      payload.body,
      JSON.stringify(payload),
      result.success ? "sent" : "failed",
      result.success ? new Date().toISOString() : null,
      result.error ?? null
    );
  } catch {
    /* DB unavailable in tests — in-memory history still recorded */
  }
  return logId;
}

export async function notifyChStateChanges(changes: ChStateChange[]): Promise<void> {
  for (const change of changes) {
    const payload = buildChStatePayload(change);
    console.log(
      `[remote-test] sendPushNotification start CH${change.channel} prev=${change.from} current=${change.to}`,
      { title: payload.title, body: payload.body }
    );
    let result: DeliveryResult = {
      channel: "web_push",
      success: false,
      error: "not attempted",
    };
    try {
      result = await sendWebPush(payload, REMOTE_TEST_USER_ID);
    } catch (err) {
      result = {
        channel: "web_push",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    console.log(
      `[remote-test] sendPushNotification result CH${change.channel}: success=${result.success}`,
      result.error ? { error: result.error } : ""
    );

    const logId = persistNotificationLog(change, payload, result);
    recordChStateNotification(change, payload, result, logId);
    markPushResult(result.success, result.error);
  }
}

export async function notifyInputStateChanges(changes: InputStateChange[]): Promise<void> {
  for (const change of changes) {
    const payload = buildInputStatePayload(change);
    console.log(
      `[remote-test] sendPushNotification start DI${change.input} prev=${change.from} current=${change.to}`,
      { title: payload.title, body: payload.body }
    );
    let result: DeliveryResult = {
      channel: "web_push",
      success: false,
      error: "not attempted",
    };
    try {
      result = await sendWebPush(payload, REMOTE_TEST_USER_ID);
    } catch (err) {
      result = {
        channel: "web_push",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    console.log(
      `[remote-test] sendPushNotification result DI${change.input}: success=${result.success}`,
      result.error ? { error: result.error } : ""
    );

    const logId = persistInputNotificationLog(change, payload, result);
    recordInputStateNotification(change, payload, result, logId);
    markPushResult(result.success, result.error);
  }
}
