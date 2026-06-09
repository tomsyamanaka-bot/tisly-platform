import type { Request } from "express";
export interface AuditEntryInput {
    tenantId?: string;
    siteId?: string;
    userId?: string;
    actorId?: string;
    actorLabel?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    targetType?: string;
    targetId?: string;
    beforeJson?: Record<string, unknown>;
    afterJson?: Record<string, unknown>;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}
export declare function auditContextFromRequest(req: Request): {
    ipAddress?: string;
    userAgent?: string;
    userId?: string;
    actorLabel?: string;
};
export declare function logAudit(input: AuditEntryInput): string;
export declare function listAuditLogs(opts: {
    tenantId?: string;
    siteId?: string;
    limit?: number;
}): {
    id: string;
    tenantId: string | null;
    siteId: string | null;
    userId: string | null;
    actorLabel: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    before: any;
    after: any;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}[];
