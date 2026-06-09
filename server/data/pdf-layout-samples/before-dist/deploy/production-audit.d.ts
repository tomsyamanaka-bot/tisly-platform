/**
 * Phase 1461–1500 — 本番統合監査（/api/deploy/audit）
 */
export type AuditItemStatus = "pass" | "fail" | "warn";
export interface ProductionAuditItem {
    id: string;
    label: string;
    status: AuditItemStatus;
    message: string;
}
export interface ProductionAuditReport {
    generatedAt: string;
    ready: boolean;
    readyLabel: string;
    phase: string;
    publicUrl: string;
    items: ProductionAuditItem[];
}
export declare function buildProductionAudit(): Promise<ProductionAuditReport>;
