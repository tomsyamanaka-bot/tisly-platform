export type SiemSeverity = "info" | "warning" | "high" | "critical";
export interface SiemEvent {
    timestamp: string;
    tenant_id: string | null;
    site_id: string | null;
    user_id: string | null;
    action: string;
    severity: SiemSeverity;
    source_ip: string | null;
    device_id: string | null;
    event_id: string | null;
    message: string;
}
export declare function exportSiemEvent(event: SiemEvent): void;
export declare function getSiemExportStatus(): {
    enabled: boolean;
    exportCount: number;
    lastAt: string | null;
    provider: string;
};
export declare function siemFromAudit(opts: {
    action: string;
    severity?: SiemSeverity;
    tenantId?: string;
    siteId?: string;
    userId?: string;
    sourceIp?: string;
    deviceId?: string;
    eventId?: string;
    message: string;
}): void;
