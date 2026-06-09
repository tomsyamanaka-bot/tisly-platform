export interface ShellyRebootInput {
    customerCode?: string;
    deviceId: string;
    actorId?: string;
    confirm?: boolean;
    dryRun?: boolean;
}
export interface ShellyRebootResult {
    ok: boolean;
    actionId: string;
    deviceId: string;
    customerCode?: string;
    shellyMode: string;
    rpcOk: boolean;
    dryRun: boolean;
    message: string;
}
export declare function executeShellyReboot(input: ShellyRebootInput): Promise<ShellyRebootResult>;
export interface ShellyRecoveryHistoryEntry {
    id: string;
    deviceId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    steps: unknown[];
}
export declare function listShellyRecoveryHistory(customerCode?: string, limit?: number): ShellyRecoveryHistoryEntry[];
