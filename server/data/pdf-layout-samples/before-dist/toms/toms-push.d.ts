export type TomsPushKind = "project_alert" | "estimate_unsent" | "invoice_unsent" | "payment_pending" | "maintenance_due" | "esp_anomaly" | "shelly_anomaly";
export declare function dispatchTomsPushAlerts(): Promise<{
    queued: number;
    sent: boolean;
    error?: string;
}>;
