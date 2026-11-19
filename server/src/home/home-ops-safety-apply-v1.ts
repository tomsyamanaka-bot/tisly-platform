/**
 * セーフティ判定のログと社内 Push。
 * 施主端末には点検中・連打・高温を出さない。
 */

import { sendWebPush } from "../notification/channels/web-push.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  noteCabinetTempV1,
  observeSensorHitV1,
  type SensorGateV1,
} from "./home-ops-safety-v1.js";

async function pushStaffV1(input: {
  siteId: string;
  title: string;
  body: string;
  eventType: string;
}): Promise<void> {
  try {
    await sendWebPush({
      title: input.title,
      body: input.body,
      eventType: input.eventType,
      deviceId: input.siteId,
      url: "/app/security",
      audience: "toms",
    });
  } catch (err) {
    console.error(
      "[ops-safety] staff push",
      err instanceof Error ? err.message : err
    );
  }
}

export async function applySensorPushGateV1(input: {
  siteId: string;
  di: number;
  siteName?: string;
  nowMs?: number;
}): Promise<SensorGateV1> {
  const gate = observeSensorHitV1(input);
  if (gate.logMessage) {
    try {
      recordSystemLogV1({
        siteId: input.siteId,
        category: gate.reason === "flood" ? "sensor_alert" : "push_notify",
        message: gate.logMessage,
        detail: { di: input.di, reason: gate.reason },
        actor: "ops-safety",
      });
    } catch {
      /* ログ不能でも監視判定は残す */
    }
  }
  if (gate.staffAlert) {
    await pushStaffV1({
      siteId: input.siteId,
      title: gate.staffAlert.title,
      body: gate.staffAlert.body,
      eventType: "ops_sensor_flood",
    });
  }
  return gate;
}

export async function applyCabinetTempV1(input: {
  siteId: string;
  tempC: number | null;
  siteName?: string;
  nowMs?: number;
}): Promise<void> {
  const note = noteCabinetTempV1(input);
  if (note.logMessage) {
    try {
      recordSystemLogV1({
        siteId: input.siteId,
        category: "sensor_alert",
        message: note.logMessage,
        detail: { tempC: note.tempC, level: note.level, audience: "toms" },
        actor: "ops-safety",
      });
    } catch {
      /* 温度ログは失敗しても心拍は続ける */
    }
  }
  if (note.staffPush) {
    await pushStaffV1({
      siteId: input.siteId,
      title: note.staffPush.title,
      body: note.staffPush.body,
      eventType: "ops_cabinet_danger",
    });
  }
}
