/**
 * Phase 1441–1460 — 本番設定監査 GET /api/deploy/preflight
 */
export type PreflightCategoryStatus = "ok" | "missing" | "warn";
export interface PreflightCategory {
    id: string;
    label: string;
    status: PreflightCategoryStatus;
    configured: string[];
    missing: string[];
    message: string;
}
export interface PreflightReport {
    generatedAt: string;
    ready: boolean;
    missing: string[];
    categories: PreflightCategory[];
}
export declare function buildDeployPreflight(source?: NodeJS.ProcessEnv): PreflightReport;
