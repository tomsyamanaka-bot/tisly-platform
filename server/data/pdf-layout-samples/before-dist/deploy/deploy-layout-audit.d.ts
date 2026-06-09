/**
 * Phase 1681–1720 — Deploy Layout & GitHub Sync 監査
 * VPS デプロイ可能なリポジトリ構成を検証（フロントは server/public/ を標準とする）
 */
export type LayoutVerdict = "READY" | "NOT READY";
export interface LayoutCheckItem {
    id: string;
    label: string;
    path: string;
    exists: boolean;
    required: boolean;
    message: string;
}
export interface DeployLayoutAuditReport {
    phase: string;
    title: string;
    generatedAt: string;
    verdict: LayoutVerdict;
    readyCount: number;
    totalRequired: number;
    checks: LayoutCheckItem[];
    notes: string[];
}
export declare function buildDeployLayoutAudit(root?: any): DeployLayoutAuditReport;
