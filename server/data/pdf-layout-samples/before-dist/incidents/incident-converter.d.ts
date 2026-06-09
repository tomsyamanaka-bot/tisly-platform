import type { IncidentSeverity, IncidentStatus } from "./incident-status.js";
/** Unified incident row (canonical: `incidents` table). */
export interface UnifiedIncident {
    id: string;
    device_id: string;
    site_id: string | null;
    customer_id: string | null;
    tenant_id: string | null;
    status: IncidentStatus;
    severity: IncidentSeverity;
    title: string | null;
    opened_at: string | null;
    closed_at: string | null;
    created_at: string;
    source: "incidents";
}
/** Legacy `recovery_incidents` shape used by customer portal / reports. */
export interface RecoveryIncidentView {
    id: string;
    tenant_id: string | null;
    customer_id: string | null;
    device_id: string | null;
    status: string;
    playbook_id: string | null;
    created_at: string | null;
}
export declare function incidentToRecoveryView(row: UnifiedIncident): RecoveryIncidentView;
export declare function mapDbIncident(row: Record<string, unknown>): UnifiedIncident;
