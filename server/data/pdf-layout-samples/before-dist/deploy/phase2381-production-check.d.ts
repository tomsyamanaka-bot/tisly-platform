export type ProductionCheckStatus = "GREEN" | "YELLOW" | "RED";
export interface ProductionCheckItem {
    id: string;
    label: string;
    ok: boolean;
    status?: ProductionCheckStatus;
    detail?: string;
}
export interface Phase2381ProductionReport {
    phase: "2381-2400";
    ready: boolean;
    shellVersion: string;
    shellTag: string;
    productionRatePercent: number;
    operationalReady: boolean;
    adminPasswordStatus: ProductionCheckStatus;
    implemented: string[];
    mockRemaining: string[];
    nextPhase: string;
    checks: ProductionCheckItem[];
}
/** 実行時 .env の ADMIN_PASSWORD_HASH が平文 temp または scrypt 以外 */
export declare function isInsecureAdminPasswordHash(hash: string | undefined, env?: NodeJS.ProcessEnv): boolean;
export declare function resolveAdminPasswordStatus(hash: string | undefined, env?: NodeJS.ProcessEnv): {
    ok: boolean;
    status: ProductionCheckStatus;
    detail: string;
};
export declare function buildPhase2381ProductionCheck(env?: NodeJS.ProcessEnv): Phase2381ProductionReport;
