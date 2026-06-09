export interface InstallDashboardStats {
    registered: number;
    unplaced: number;
    untested: number;
    commOk: number;
    commNg: number;
    completionRate: number;
    totalDevices: number;
    nextSteps: string[];
    incompleteOnly: Array<{
        deviceId: string;
        reason: string;
    }>;
}
export declare function getInstallDashboard(customerId: string): InstallDashboardStats;
