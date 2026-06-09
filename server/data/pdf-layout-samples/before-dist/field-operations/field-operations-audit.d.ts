export interface FieldOpsCheck {
    id: string;
    area: string;
    label: string;
    status: "pass" | "warn" | "fail";
    path?: string;
    api?: string;
    detail?: string;
}
export type FieldVerdict = "FIELD_READY" | "FIELD_WARNING" | "FIELD_NOT_READY";
export interface FieldOperationsAudit {
    phase: string;
    generatedAt: string;
    checks: FieldOpsCheck[];
    passCount: number;
    total: number;
    readyRate: number;
    fieldReadyRate: number;
    surveyReady: boolean;
    projectReady: boolean;
    installReady: boolean;
    maintenanceReady: boolean;
    customerHandoverReady: boolean;
    proRemoteLinked: boolean;
    verdict: FieldVerdict;
    fieldReady: boolean;
}
export declare function buildFieldOperationsAudit(): FieldOperationsAudit;
