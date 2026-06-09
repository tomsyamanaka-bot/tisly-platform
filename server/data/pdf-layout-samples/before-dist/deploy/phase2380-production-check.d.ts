export interface ProductionCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}
export interface Phase2380ProductionReport {
    phase: "2351-2380";
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
export declare function buildPhase2380ProductionCheck(): Phase2380ProductionReport;
