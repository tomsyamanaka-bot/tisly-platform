/**
 * Phase904 — ESP MQTT Heartbeat → ONLINE / WARNING / OFFLINE + KPI
 */
import { getDatabase } from "../db/database.js";
import { recordDeviceHeartbeat, evaluateDeviceHeartbeatStatuses } from "./device-heartbeat.js";
import { buildTomsKpi } from "../toms/toms-kpi.js";
import { estimateDispatchReductionJpy } from "../demo-kit/demo-kpi-export.js";

export interface EspHeartbeatKpi {
  totalEsp: number;
  online: number;
  warning: number;
  offline: number;
  lastEvaluatedAt: string;
  anomalyCount: number;
  dispatchReductionEstimate: number;
}

let lastKpi: EspHeartbeatKpi | null = null;

export function handleEspMqttHeartbeat(
  deviceId: string,
  payload?: { platform?: string; rssi?: number; uptime?: number }
): { status: string } {
  const platform = payload?.platform ?? "esp-mqtt";
  const status = recordDeviceHeartbeat(deviceId, platform);
  refreshEspHeartbeatKpi();
  return { status };
}

export function refreshEspHeartbeatKpi(): EspHeartbeatKpi {
  evaluateDeviceHeartbeatStatuses();
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT device_id, device_type, device_status FROM devices
       WHERE device_type LIKE '%esp%' OR device_type LIKE '%gateway%'
          OR device_id LIKE '%ESP%'`
    )
    .all() as Array<{ device_id: string; device_type: string; device_status: string | null }>;

  let online = 0;
  let warning = 0;
  let offline = 0;
  for (const r of rows) {
    const s = (r.device_status ?? "OFFLINE").toUpperCase();
    if (s === "ONLINE") online++;
    else if (s === "WARNING") warning++;
    else offline++;
  }

  const kpi = buildTomsKpi();
  lastKpi = {
    totalEsp: rows.length,
    online,
    warning,
    offline,
    lastEvaluatedAt: new Date().toISOString(),
    anomalyCount: kpi.anomalyCount,
    dispatchReductionEstimate: estimateDispatchReductionJpy(kpi.anomalyCount),
  };
  return lastKpi;
}

export function getEspHeartbeatKpi(): EspHeartbeatKpi {
  return lastKpi ?? refreshEspHeartbeatKpi();
}
