export type IntegrationLogType = "calendar" | "gmail" | "qnap" | "pdf" | "status_flow";
export type IntegrationLogStatus = "success" | "error" | "skipped";
export interface BusinessIntegrationLog {
    id: string;
    projectId: string | null;
    type: IntegrationLogType;
    provider: string;
    status: IntegrationLogStatus;
    requestJson: string | null;
    responseJson: string | null;
    errorMessage: string | null;
    createdAt: string;
}
export declare function logBusinessIntegration(input: {
    projectId?: string | null;
    type: IntegrationLogType;
    provider: string;
    status: IntegrationLogStatus;
    request?: unknown;
    response?: unknown;
    errorMessage?: string;
}): BusinessIntegrationLog;
export declare function listBusinessIntegrationLogs(opts?: {
    projectId?: string;
    type?: IntegrationLogType;
    limit?: number;
}): BusinessIntegrationLog[];
export declare function exportIntegrationLogsCsv(opts?: {
    projectId?: string;
    type?: IntegrationLogType;
    limit?: number;
}): string;
export declare function purgeIntegrationLogsOlderThan(days: number): {
    deleted: number;
};
