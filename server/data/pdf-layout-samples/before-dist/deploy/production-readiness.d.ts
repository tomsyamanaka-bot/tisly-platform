/**
 * Phase 1381–1400 — Production Readiness（/app ダッシュボード用）
 */
import type { DeployDryRunReport } from "./deploy-dry-run.js";
export type ReadinessStatus = "pass" | "fail" | "warn";
export interface ProductionReadinessItem {
    id: string;
    label: string;
    status: ReadinessStatus;
    message: string;
}
export interface ProductionReadinessReport {
    generatedAt: string;
    items: ProductionReadinessItem[];
    publishable: boolean;
    publishableLabel: string;
}
export declare function buildProductionReadiness(dryRun: DeployDryRunReport): ProductionReadinessReport;
