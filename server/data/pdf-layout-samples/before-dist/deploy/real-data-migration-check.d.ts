/**
 * Phase 2201–2250 — 実データ移行チェック
 */
export interface RealDataMigrationCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}
export interface RealDataMigrationReport {
    phase: "2201-2250";
    ready: boolean;
    shellVersion: string;
    shellTag: string;
    productionRatePercent: number;
    implemented: string[];
    mockRemaining: string[];
    nextPhase: string;
    checks: RealDataMigrationCheckItem[];
}
export declare function buildRealDataMigrationCheck(): RealDataMigrationReport;
