/**
 * Phase 301-320 — post-migration verification report.
 */
import type { Database } from "better-sqlite3";
export interface MigrationVerifyReport {
    generatedAt: string;
    sqlite: {
        customers: number;
        events: number;
        incidents: number;
        webhookDeliveries: number;
        reportEmailQueue: number;
    };
    ok: boolean;
    notes: string[];
}
export declare function buildMigrationVerifyReport(sqlite: Database): MigrationVerifyReport;
