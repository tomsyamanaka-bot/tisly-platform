export type IncidentPhase = "anomaly" | "notify" | "respond" | "recover" | "close";
export interface TimelineEntry {
    id: string;
    incidentId: string;
    phase: IncidentPhase;
    title: string;
    detail?: string;
    deviceId?: string;
    siteId?: string;
    createdAt: string;
}
export declare function ensureIncident(deviceId: string, siteId?: string): string;
export declare function appendTimeline(incidentId: string, phase: IncidentPhase, title: string, detail?: string, deviceId?: string, siteId?: string): string;
export declare function getIncidentTimeline(incidentId?: string, limit?: number): TimelineEntry[];
export declare function closeIncident(incidentId: string): void;
