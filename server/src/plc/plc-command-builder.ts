import { findModbusPoint } from "./modbus-map.js";

export type PlcCommandAction =
  | "patlite_on"
  | "patlite_off"
  | "buzzer_on"
  | "buzzer_off"
  | "light_on"
  | "light_off"
  | "reset_alarm"
  | "heartbeat_pulse";

const ACTION_MAP: Record<PlcCommandAction, string> = {
  patlite_on: "patlite",
  patlite_off: "patlite",
  buzzer_on: "buzzer",
  buzzer_off: "buzzer",
  light_on: "light_zone_a",
  light_off: "light_zone_a",
  reset_alarm: "alarm_latch",
  heartbeat_pulse: "heartbeat_ok",
};

export interface PlcModbusWrite {
  area: string;
  address: number;
  value: boolean | number;
  logicalName: string;
}

export function buildPlcCommand(action: PlcCommandAction): PlcModbusWrite | null {
  const logical = ACTION_MAP[action];
  const point = findModbusPoint(logical);
  if (!point) return null;

  const on = action.endsWith("_on") || action === "heartbeat_pulse" || action === "reset_alarm";
  const value =
    point.area === "D"
      ? action === "reset_alarm"
        ? 0
        : on
          ? 1
          : 0
      : on;

  return {
    area: point.area,
    address: point.address,
    value,
    logicalName: point.logicalName,
  };
}

export function buildMqttCmdTopic(
  tenantId: string,
  siteId: string,
  deviceId: string
): string {
  return `tisly/${tenantId}/${siteId}/${deviceId}/cmd`;
}
