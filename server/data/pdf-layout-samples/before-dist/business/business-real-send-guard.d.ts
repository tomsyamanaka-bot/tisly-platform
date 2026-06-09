export type RealSendOperation = "gmail_send" | "calendar_create" | "qnap_real_upload" | "pdf_generate" | "web_push";
export interface BusinessRealSendSettings {
    dryRun: boolean;
    mockOnly: boolean;
    realSendEnabled: boolean;
}
export declare function getBusinessRealSendSettings(): BusinessRealSendSettings;
export declare function saveBusinessRealSendSettings(patch: Partial<BusinessRealSendSettings>): BusinessRealSendSettings;
export declare function assertRealSendAllowed(operation: RealSendOperation, opts?: {
    confirmed?: boolean;
    mode?: "mock" | "dryRun" | "real";
}): {
    allowed: boolean;
    dryRun: boolean;
    reason?: string;
};
