import { config } from "../config.js";
import { getDatabase, getPlatformSetting } from "../db/database.js";
import { recordDeviceHeartbeat } from "../device/device-heartbeat.js";
import type { NotificationService } from "./notification-service.js";

interface HeartbeatSettings {
  warnSec: number;
  alarmSec: number;
}

const deviceLastState = new Map<string, string>();

export function recordHeartbeat(deviceId: string, platform?: string): void {
  recordDeviceHeartbeat(deviceId, platform);
  deviceLastState.set(deviceId, "ok");
}

export function startHeartbeatMonitor(service: NotificationService): void {
  const hb = getPlatformSetting<HeartbeatSettings>("heartbeat");
  const warnSec = hb?.warnSec ?? config.heartbeat.warnSec;
  const alarmSec = hb?.alarmSec ?? config.heartbeat.alarmSec;

  setInterval(() => {
    const db = getDatabase();
    const devices = db
      .prepare(
        `SELECT device_id, last_heartbeat_at, heartbeat_status FROM devices WHERE last_heartbeat_at IS NOT NULL`
      )
      .all() as Array<{
      device_id: string;
      last_heartbeat_at: string;
      heartbeat_status: string;
    }>;

    const now = Date.now();
    for (const d of devices) {
      const elapsed = (now - new Date(d.last_heartbeat_at).getTime()) / 1000;
      let nextStatus = "ok";
      let eventType: string | null = null;

      if (elapsed >= alarmSec) {
        nextStatus = "alarm";
        eventType = "heartbeat_alarm";
      } else if (elapsed >= warnSec) {
        nextStatus = "warning";
        eventType = "heartbeat_warning";
      }

      if (eventType && deviceLastState.get(d.device_id) !== nextStatus) {
        deviceLastState.set(d.device_id, nextStatus);
        db.prepare("UPDATE devices SET heartbeat_status = ? WHERE device_id = ?").run(
          nextStatus,
          d.device_id
        );
        void service.processEvent({
          deviceId: d.device_id,
          eventType,
          title:
            eventType === "heartbeat_alarm"
              ? `通信断 — ${d.device_id}`
              : `通信遅延 — ${d.device_id}`,
          body: `${Math.floor(elapsed)}秒間ハートビート未受信`,
          severity: eventType === "heartbeat_alarm" ? "alarm" : "warning",
        });
      } else if (!eventType && d.heartbeat_status !== "ok") {
        deviceLastState.set(d.device_id, "ok");
        db.prepare("UPDATE devices SET heartbeat_status = 'ok' WHERE device_id = ?").run(
          d.device_id
        );
      }
    }
  }, 10_000);
}
