export interface AdminSessionRecord {
    id: string;
    userId: string;
    expiresAt: string;
    revokedAt: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}
export declare function createSession(opts: {
    userId: string;
    tokenId: string;
    ipAddress?: string;
    userAgent?: string;
}): AdminSessionRecord;
export declare function revokeSession(sessionId: string): boolean;
export declare function revokeSessionByTokenId(tokenId: string | undefined): boolean;
export declare function isSessionRevoked(tokenId: string | undefined): boolean;
export declare function listActiveSessions(userId?: string): AdminSessionRecord[];
export declare function getSessionStoreStatus(): {
    active: number;
    provider: string;
};
