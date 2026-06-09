export interface ProductionCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}
export interface Phase2350ProductionReport {
    phase: "2301-2350";
    ready: boolean;
    shellVersion: string;
    shellTag: string;
    productionRatePercent: number;
    operationalReady: boolean;
    implemented: string[];
    mockRemaining: string[];
    nextPhase: string;
    checks: ProductionCheckItem[];
}
export declare function buildPhase2350ProductionCheck(): Phase2350ProductionReport;
