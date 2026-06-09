/**
 * Phase 1381–1400 — 本番 URL 監査（localhost / 127.0.0.1 / 192.168. / ws:// 検索）
 */
export type UrlViolationKind = "localhost" | "127.0.0.1" | "192.168." | "ws://";
export interface UrlViolation {
    file: string;
    line: number;
    kind: UrlViolationKind;
    snippet: string;
    route?: string;
    blocking: boolean;
}
export interface ProductionUrlAuditReport {
    scannedAt: string;
    routes: string[];
    violations: UrlViolation[];
    blockingCount: number;
    acceptableCount: number;
    publicFacingClean: boolean;
}
/** 監査対象ルートと関連 HTML */
export declare const PRODUCTION_ROUTE_FILES: Record<string, string[]>;
/** server/public 配下の本番 PWA 関連ファイルをスキャン */
export declare function buildProductionUrlAudit(): ProductionUrlAuditReport;
