/**
 * Phase 1441–1460 — VPS Deploy Status（/app カード用）
 */
import type { DeployDryRunReport } from "./deploy-dry-run.js";
export type VpsDeployItemStatus = "pass" | "fail" | "warn";
export interface VpsDeployStatusItem {
    id: string;
    label: string;
    status: VpsDeployItemStatus;
    message: string;
}
export interface VpsDeployStatusReport {
    generatedAt: string;
    ready: boolean;
    readyLabel: string;
    items: VpsDeployStatusItem[];
}
export declare function buildVpsDeployStatus(dryRun: DeployDryRunReport): VpsDeployStatusReport;
