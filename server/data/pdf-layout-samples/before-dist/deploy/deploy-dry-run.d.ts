/**
 * Phase 1291–1320 — VPS デプロイ前 dry-run（検電器）
 */
import { type PwaPublishAuditReport } from "../pwa/pwa-publish-audit.js";
export type DryRunCheckStatus = "pass" | "fail" | "warn";
export interface DryRunCheckItem {
    id: string;
    name: string;
    status: DryRunCheckStatus;
    message: string;
    hint?: string;
}
export interface SecretLeakCheck {
    passed: boolean;
    findings: string[];
}
export interface UploadsGitignoreCheck {
    passed: boolean;
    message: string;
}
export interface ReleaseGateInfo {
    status: "pass" | "fail";
    message: string;
    steps: {
        id: string;
        name: string;
        status: "pass" | "fail" | "pending" | "warn";
        message?: string;
    }[];
}
export interface DeployDryRunReport {
    generatedAt: string;
    passed: boolean;
    summary: {
        pass: number;
        fail: number;
        warn: number;
    };
    checks: DryRunCheckItem[];
    productionUrls: string[];
    mockItems: string[];
    realSwitchItems: string[];
    tislyPublicUrl: string;
    isProductionUrl: boolean;
    pwaInstallReady: number;
    googleTvCaution: string;
    secretLeakCheck: SecretLeakCheck;
    uploadsGitignore: UploadsGitignoreCheck;
    pwaAudit: Pick<PwaPublishAuditReport, "summary" | "mockReal" | "pwAs" | "isProductionUrl" | "tislyPublicUrl">;
    lastDryRunAt: string | null;
    releaseGate?: ReleaseGateInfo;
}
export declare const LAST_DRY_RUN_FILE: any;
/** .env.production.example に含めるべき必須キー名 */
export declare const REQUIRED_ENV_KEYS: string[];
export declare function checkSecretLeakInGitDiff(diffText?: string): SecretLeakCheck;
export declare function checkUploadsGitignore(gitignore?: string): UploadsGitignoreCheck;
export declare function buildMockRealLists(source?: NodeJS.ProcessEnv): {
    mockItems: string[];
    realSwitchItems: string[];
};
export declare function readLastDryRunAt(): string | null;
export declare function writeLastDryRunReport(report: DeployDryRunReport): void;
export declare function buildDeployDryRun(source?: NodeJS.ProcessEnv, options?: {
    includeReleaseGate?: boolean;
    gitDiff?: string;
}): DeployDryRunReport;
export declare function buildReleaseGateInfo(dryRun: DeployDryRunReport): ReleaseGateInfo;
