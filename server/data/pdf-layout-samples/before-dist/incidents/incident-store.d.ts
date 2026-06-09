import { type RecoveryIncidentView, type UnifiedIncident } from "./incident-converter.js";
import { type IncidentStatus } from "./incident-status.js";
export interface IncidentScope {
    customerId?: string;
    tenantId?: string;
}
export declare function scopeFromCustomerCode(customerCode: string | undefined): IncidentScope | null;
export declare function listIncidents(scope: IncidentScope | null, opts?: {
    status?: string;
    limit?: number;
}): UnifiedIncident[];
export declare function getIncidentById(id: string, scope?: IncidentScope | null): UnifiedIncident | null;
export declare function listRecoveryHistory(tenantOrCustomerId: string, limit?: number): RecoveryIncidentView[];
export declare function countOpenIncidents(scope: IncidentScope | null): number;
export declare function countBySeverity(scope: IncidentScope | null): {
    critical: number;
    alarm: number;
    warning: number;
    open: number;
};
export declare function updateIncidentStatus(id: string, status: IncidentStatus, actor: {
    userId: string;
    username: string;
}, scope?: IncidentScope | null, ip?: string): boolean;
export declare function ensureDemoIncidents(): void;
