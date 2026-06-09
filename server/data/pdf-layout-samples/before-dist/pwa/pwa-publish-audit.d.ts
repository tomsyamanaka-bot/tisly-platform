/**
 * Phase 1241–1280 — PWA 本番公開監査（tisly.jp デプロイ前チェック）
 */
import { type EnvCheckItem } from "../config/production-env-checker.js";
export type PublishStatus = "ok" | "caution" | "not_ready";
export interface PwaPublishAuditItem {
    pwaName: string;
    id: string;
    productionUrl: string;
    localUrl: string;
    manifestUrl: string;
    scope: string;
    startUrl: string;
    serviceWorker: string;
    installReady: boolean;
    missingItems: string[];
    recommendedAction: string;
    status: PublishStatus;
    isPwa: boolean;
}
export interface MockRealStatus {
    service: string;
    mode: "mock" | "real" | "unknown";
    envKeys: string[];
    demoSafe: string;
}
export interface PwaPublishAuditReport {
    generatedAt: string;
    productionBaseUrl: string;
    localBaseUrl: string;
    tislyPublicUrl: string;
    isProductionUrl: boolean;
    nodeEnv: string;
    mockReal: MockRealStatus[];
    envChecks: EnvCheckItem[];
    hasBlockingEnvErrors: boolean;
    pwAs: PwaPublishAuditItem[];
    summary: {
        ok: number;
        caution: number;
        notReady: number;
        installReady: number;
    };
}
interface PwaAuditSpec {
    id: string;
    pwaName: string;
    pathTemplate: string;
    manifestPath: string;
    scope: string;
    startUrl: string;
    serviceWorker: string;
    isPwa: boolean;
    manifestIsDynamic?: boolean;
    staticManifestFile?: string;
}
/** RC2 公開対象 PWA の監査定義 */
export declare const PWA_AUDIT_SPECS: PwaAuditSpec[];
export declare function buildPwaPublishAudit(source?: NodeJS.ProcessEnv): PwaPublishAuditReport;
/** nginx テンプレートに含めるべきルート接頭辞 */
export declare const NGINX_REQUIRED_ROUTE_PREFIXES: string[];
export {};
