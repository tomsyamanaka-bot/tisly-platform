export type IncidentStatus = "open" | "acknowledged" | "escalated" | "resolved" | "closed";
export type IncidentSeverity = "info" | "warning" | "alarm" | "critical";
export declare const OPEN_INCIDENT_STATUSES: IncidentStatus[];
export declare function isOpenStatus(status: string): boolean;
export declare function canTransition(from: IncidentStatus, to: IncidentStatus): boolean;
