import type { ProjectTimelineEntry } from "./project-timeline.js";
export type LivePushChannel = "devices" | "notifications" | "timeline" | "floor_alert";
export interface ProjectLivePayload {
    projectId: string;
    channel: LivePushChannel;
    data: Record<string, unknown>;
}
export declare function pushProjectDevicesLive(projectId: string, devices: unknown[], opts?: {
    scrollTier?: string;
    severity?: "info" | "warning" | "critical";
}): void;
export declare function pushProjectNotificationsLive(projectId: string, notifications: unknown[]): void;
export declare function pushProjectTimelineLive(projectId: string, entry: ProjectTimelineEntry | Record<string, unknown>): void;
export declare function pushFloorAlertLive(projectId: string, tier: string, severity: "warning" | "critical"): void;
export declare function broadcastHeartbeat(): void;
