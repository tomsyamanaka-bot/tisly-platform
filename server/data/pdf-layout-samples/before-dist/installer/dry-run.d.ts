import type { Request } from "express";
export declare function isDryRunRequest(req: Request): boolean;
export interface DryRunLogEntry {
    action: string;
    at: string;
    body?: Record<string, unknown>;
}
export declare function logDryRun(customerCode: string, action: string, body?: Record<string, unknown>): void;
export declare function getDryRunLogs(customerCode: string): DryRunLogEntry[];
export declare function clearDryRunLogsForTests(): void;
