/**
 * PLC Modbus 仮マップ（実機到着後に GX Works / 実配線で確定）
 */

export type ModbusArea = "X" | "Y" | "M" | "D";

export interface ModbusPoint {
  area: ModbusArea;
  address: number;
  logicalName: string;
  role: string;
  activeLow?: boolean;
  note?: string;
}

export const PLC_MODBUS_MAP: ModbusPoint[] = [
  { area: "X", address: 0, logicalName: "emergency_stop", role: "input", note: "非常停止" },
  { area: "X", address: 1, logicalName: "door_contact", role: "input", note: "扉接点" },
  { area: "X", address: 2, logicalName: "ir_beam", role: "input", note: "赤外線" },
  { area: "Y", address: 0, logicalName: "patlite", role: "output", note: "パトライト" },
  { area: "Y", address: 1, logicalName: "buzzer", role: "output", note: "ブザー" },
  { area: "Y", address: 2, logicalName: "light_zone_a", role: "output", note: "ライト A" },
  { area: "M", address: 100, logicalName: "alarm_latch", role: "internal", note: "警報ラッチ" },
  { area: "M", address: 101, logicalName: "heartbeat_ok", role: "internal", note: "heartbeat 正常" },
  { area: "D", address: 0, logicalName: "alarm_code", role: "register", note: "警報コード" },
  { area: "D", address: 1, logicalName: "heartbeat_counter", role: "register", note: "heartbeat カウンタ" },
  { area: "D", address: 10, logicalName: "site_status", role: "register", note: "拠点状態" },
];

export function findModbusPoint(logicalName: string): ModbusPoint | undefined {
  return PLC_MODBUS_MAP.find((p) => p.logicalName === logicalName);
}
