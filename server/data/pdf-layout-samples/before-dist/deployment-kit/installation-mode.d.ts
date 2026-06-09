export type InstallStepType = "placement" | "photo" | "test" | "sign" | "gps";
export interface InstallStepInput {
    customerCode: string;
    siteId?: string;
    deviceId?: string;
    step: InstallStepType;
    photoPath?: string;
    signatureData?: string;
    gpsLat?: number;
    gpsLng?: number;
    notes?: string;
    installerUserId?: string;
}
export declare function recordInstallStep(input: InstallStepInput): {
    id: any;
    step: InstallStepType;
    recordedAt: string;
};
export declare function getInstallRecords(customerCode: string, deviceId?: string): any;
export declare function getInstallationDashboard(customerCode: string): {
    customerCode: string;
    devices: {
        deviceId: string;
        label: string;
        siteId: string;
        status: string;
        steps: string[];
        complete: boolean;
    }[];
    installUrl: string;
} | null;
