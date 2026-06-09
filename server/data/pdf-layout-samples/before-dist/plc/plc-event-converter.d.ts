import type { UnifiedEvent } from "../event/unified-event.js";
import { type ModbusPoint } from "./modbus-map.js";
export interface PlcRawReading {
    tenantId?: string;
    siteId?: string;
    deviceId: string;
    alarmCode?: number;
    points?: Array<{
        logicalName: string;
        value: boolean | number;
    }>;
    timestamp?: string;
}
export declare function plcReadingToUnified(reading: PlcRawReading): UnifiedEvent;
export declare function modbusPointLabel(point: ModbusPoint): string;
