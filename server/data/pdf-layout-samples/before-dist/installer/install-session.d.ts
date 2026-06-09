export type InstallSessionMode = "live" | "dry_run" | "practice";
export type InstallSessionStatus = "active" | "completed" | "cancelled";
export interface InstallSession {
    id: string;
    customerId: string;
    siteId: string | null;
    installerUserId: string | null;
    mode: InstallSessionMode;
    startedAt: string;
    completedAt: string | null;
    status: InstallSessionStatus;
}
export declare function startInstallSession(input: {
    customerId: string;
    siteId?: string;
    installerUserId?: string;
    mode?: InstallSessionMode;
}): InstallSession;
export declare function completeInstallSession(sessionId: string, customerId: string): InstallSession;
export declare function listInstallSessions(customerId: string, limit?: number): InstallSession[];
