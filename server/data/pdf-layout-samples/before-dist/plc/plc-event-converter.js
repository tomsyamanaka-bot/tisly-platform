import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { normalizeUnifiedInput } from "../event/unified-event.js";
export function plcReadingToUnified(reading) {
    const alarmCode = reading.alarmCode ?? 0;
    const emergency = reading.points?.find((p) => p.logicalName === "emergency_stop");
    const isAlarm = alarmCode > 0 || (emergency && Boolean(emergency.value));
    return normalizeUnifiedInput({
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
    }, config.defaultTenantId);
}
export function modbusPointLabel(point) {
    return `${point.area}${point.address} (${point.logicalName})`;
}
