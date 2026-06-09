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
export declare const PLC_MODBUS_MAP: ModbusPoint[];
export declare function findModbusPoint(logicalName: string): ModbusPoint | undefined;
