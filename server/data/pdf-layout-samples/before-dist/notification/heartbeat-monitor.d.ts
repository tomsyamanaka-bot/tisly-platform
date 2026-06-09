import type { NotificationService } from "./notification-service.js";
export declare function recordHeartbeat(deviceId: string, platform?: string): void;
export declare function startHeartbeatMonitor(service: NotificationService): void;
