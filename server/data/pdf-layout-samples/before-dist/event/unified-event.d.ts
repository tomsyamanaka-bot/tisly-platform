import type { EventSeverity, TislyEvent } from "../notification/types.js";
export type SourceType = "esp32" | "rp2350" | "plc" | "node-red" | "system" | "tv-app";
export interface UnifiedEvent {
    event_id: string;
    tenant_id: string;
    site_id: string;
    device_id: string;
    source_type: SourceType;
    event_type: string;
    severity: EventSeverity;
    zone: string;
    message: string;
    payload: Record<string, unknown>;
    created_at: string;
}
export declare function normalizeUnifiedInput(body: Record<string, unknown>, defaultTenantId: string): UnifiedEvent;
export declare function unifiedToTislyEvent(u: UnifiedEvent): TislyEvent;
