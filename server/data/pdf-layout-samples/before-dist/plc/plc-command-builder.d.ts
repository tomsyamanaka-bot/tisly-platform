export type PlcCommandAction = "patlite_on" | "patlite_off" | "buzzer_on" | "buzzer_off" | "light_on" | "light_off" | "reset_alarm" | "heartbeat_pulse";
export interface PlcModbusWrite {
    area: string;
    address: number;
    value: boolean | number;
    logicalName: string;
}
export declare function buildPlcCommand(action: PlcCommandAction): PlcModbusWrite | null;
export declare function buildMqttCmdTopic(tenantId: string, siteId: string, deviceId: string): string;
