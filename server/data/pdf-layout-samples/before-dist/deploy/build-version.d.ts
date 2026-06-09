/**
 * Phase 1441–1460 — ビルドバージョン・コミット追跡（/app 右下・/api/health）
 */
export interface BuildVersionInfo {
    label: string;
    build: string;
    commit: string;
    commitShort: string;
    date: string;
    phase: string;
}
export declare function getBuildVersion(): BuildVersionInfo;
