export interface BusinessAlert {
    id: string;
    kind: "payment_due" | "offline_queue" | "google_error" | "qnap_error" | "pdf_error" | "estimate_unsent";
    title: string;
    body: string;
    href: string;
}
export declare function collectBusinessAlerts(): BusinessAlert[];
export declare function sendBusinessMockNotifications(): Promise<{
    alerts: BusinessAlert[];
    push: {
        success: boolean;
        error?: string;
    };
}>;
