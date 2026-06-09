export type ProjectNotificationKind = "unacked_alert" | "estimate_unsent" | "invoice_unsent" | "payment_pending" | "maintenance_due" | "esp_anomaly" | "shelly_anomaly" | "camera_anomaly";
export interface ProjectNotification {
    id: string;
    projectId: string;
    kind: ProjectNotificationKind;
    title: string;
    body: string;
    severity: "info" | "warning" | "critical";
    href: string;
    acknowledged: boolean;
    acknowledgedAt: string | null;
    createdAt: string;
}
export declare function refreshProjectNotifications(projectId: string): ProjectNotification[];
export declare function listProjectNotifications(projectId: string): ProjectNotification[];
export declare function acknowledgeProjectNotification(projectId: string, notificationId: string, actor: string): ProjectNotification | null;
