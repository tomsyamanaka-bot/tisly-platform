/**
 * Phase 1381–1400 — PWA インストール監査（manifest / icons / SW / meta）
 */
export interface PwaInstallCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}
export interface PwaInstallAuditEntry {
    route: string;
    htmlFile: string;
    manifestFile: string | null;
    checks: PwaInstallCheckItem[];
    missing: string[];
    installReady: boolean;
}
export interface PwaInstallAuditReport {
    scannedAt: string;
    entries: PwaInstallAuditEntry[];
    readyCount: number;
    totalPwa: number;
    allMissing: string[];
}
export declare function buildPwaInstallAudit(): PwaInstallAuditReport;
