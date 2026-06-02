import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import type { UnifiedEvent } from "../event/unified-event.js";
import { normalizeUnifiedInput } from "../event/unified-event.js";
import { findModbusPoint, type ModbusPoint } from "./modbus-map.js";

export interface PlcRawReading {
  tenantId?: string;
  siteId?: string;
  deviceId: string;
  alarmCode?: number;
  points?: Array<{ logicalName: string; value: boolean | number }>;
  timestamp?: string;
}

export function plcReadingToUnified(reading: PlcRawReading): UnifiedEvent {
  const alarmCode = reading.alarmCode ?? 0;
  const emergency = reading.points?.find((p) => p.logicalName === "emergency_stop");
  const isAlarm =
    alarmCode > 0 || (emergency && Boolean(emergency.value));

  return normalizeUnifiedInput(
    {
      event_id: `plc-${uuid()}`,
      tenant_id: reading.tenantId ?? config.defaultTenantId,
      site_id: reading.siteId ?? "default",
      device_id: reading.deviceId,
      source_type: "plc",
      event_type: isAlarm ? "plc_alarm" : "plc_status",
      severity: isAlarm ? "alarm" : "info",
      zone: "plc-modbus",
      message: isAlarm
        ? `PLC 警報 code=${alarmCode}`
        : `PLC 状態更新 code=${alarmCode}`,
      payload: {
        alarm_code: alarmCode,
        points: reading.points ?? [],
      },
      created_at: reading.timestamp ?? new Date().toISOString(),
    },
    config.defaultTenantId
  );
}

export function modbusPointLabel(point: ModbusPoint): string {
  return `${point.area}${point.address} (${point.logicalName})`;
}
