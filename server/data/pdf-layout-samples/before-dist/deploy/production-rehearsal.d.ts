/**
 * Phase 1581–1620 — Production Deployment Rehearsal
 * ConoHa VPS 投入前の本番同等総点検（判定のみ・新業務機能なし）
 */
import { type DeployDryRunReport } from "./deploy-dry-run.js";
export declare const REHEARSAL_PHASE = "1581-1620";
export declare const DEMO_CUSTOMER = "TOMS001";
export type RehearsalStatus = "pass" | "fail" | "warn";
export type ReadyVerdict = "READY" | "NOT READY";
export interface RehearsalCheck {
    id: string;
    label: string;
    status: RehearsalStatus;
    message: string;
}
export interface UrlCheckEntry {
    path: string;
    label: string;
    http: RehearsalCheck;
    manifest: RehearsalCheck;
    serviceWorker: RehearsalCheck;
    icon: RehearsalCheck;
    ready: boolean;
}
export interface UrlCheckReport {
    phase: string;
    generatedAt: string;
    entries: UrlCheckEntry[];
    readyCount: number;
    total: number;
    readyRate: number;
    verdict: ReadyVerdict;
}
export declare function buildUrlCheck(): UrlCheckReport;
export interface PwaRehearsalEntry {
    id: string;
    pwaName: string;
    route: string;
    installReady: RehearsalCheck;
    manifest: RehearsalCheck;
    serviceWorker: RehearsalCheck;
    offlineCache: RehearsalCheck;
    standalone: RehearsalCheck;
    icon: RehearsalCheck;
    ready: boolean;
}
export interface PwaRehearsalReport {
    phase: string;
    generatedAt: string;
    entries: PwaRehearsalEntry[];
    readyCount: number;
    totalPwa: number;
    readyRate: number;
    verdict: ReadyVerdict;
}
export declare function buildPwaRehearsalAudit(source?: NodeJS.ProcessEnv): PwaRehearsalReport;
export interface TvRehearsalReport {
    phase: string;
    generatedAt: string;
    checks: RehearsalCheck[];
    verdict: ReadyVerdict;
}
export declare function buildTvRehearsalAudit(): TvRehearsalReport;
export interface SecurityRehearsalReport {
    phase: string;
    generatedAt: string;
    checks: RehearsalCheck[];
    envFile: RehearsalCheck;
    jwt: RehearsalCheck;
    secret: RehearsalCheck;
    adminHash: RehearsalCheck;
    debugFlag: RehearsalCheck;
    mockFlag: RehearsalCheck;
    blockingItems: string[];
    verdict: ReadyVerdict;
}
export declare function buildSecurityRehearsalAudit(source?: NodeJS.ProcessEnv): SecurityRehearsalReport;
export interface ReadyScoreCategory {
    id: string;
    label: string;
    maxPoints: number;
    score: number;
    status: RehearsalStatus;
    message: string;
}
export interface ReadyScoreReport {
    total: number;
    maxTotal: number;
    label: string;
    verdict: ReadyVerdict;
    categories: ReadyScoreCategory[];
    ngItems: string[];
}
export declare function calculateReadyScore(input: {
    dryRun: DeployDryRunReport;
    urlCheck: UrlCheckReport;
    pwaAudit: PwaRehearsalReport;
    tvAudit: TvRehearsalReport;
    securityAudit: SecurityRehearsalReport;
    healthOk: boolean;
    releaseGatePass: boolean;
    buildOk: boolean;
    testOk: boolean;
}): ReadyScoreReport;
export interface ProductionSimulationReport {
    phase: string;
    title: string;
    generatedAt: string;
    verdict: ReadyVerdict;
    readyScore: ReadyScoreReport;
    sections: {
        releaseGate: RehearsalCheck;
        health: RehearsalCheck;
        build: RehearsalCheck;
        nginx: RehearsalCheck;
        ws: RehearsalCheck;
        pwa: RehearsalCheck;
        env: RehearsalCheck;
    };
    urlCheck: UrlCheckReport;
    pwaAudit: PwaRehearsalReport;
    tvAudit: TvRehearsalReport;
    securityAudit: SecurityRehearsalReport;
    dryRun: DeployDryRunReport;
    summary: {
        build: string;
        health: string;
        releaseGate: string;
        pwa: string;
        tv: string;
        security: string;
        url: string;
        readyRate: number;
    };
}
export declare function buildProductionSimulation(source?: NodeJS.ProcessEnv): ProductionSimulationReport;
