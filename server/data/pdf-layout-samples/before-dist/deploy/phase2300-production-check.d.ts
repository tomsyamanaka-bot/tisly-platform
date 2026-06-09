export interface ProductionCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}
export interface Phase2300ProductionReport {
    phase: "2251-2300";
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
export declare function buildPhase2300ProductionCheck(): Phase2300ProductionReport;
