export type QnapArchiveKind = "events" | "reports" | "cameras";
export declare function buildQnapArchivePath(kind: QnapArchiveKind, tenantId: string, siteId: string, date?: Date): string;
export declare function buildQnapRemotePath(kind: QnapArchiveKind, tenantId: string, siteId: string, filename: string, date?: Date): string;
