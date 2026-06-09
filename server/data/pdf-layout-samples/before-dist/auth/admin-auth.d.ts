export interface AdminSession {
    userId: string;
    username: string;
    role: string;
    token: string;
    tokenId?: string;
}
export declare function isAuthConfigured(): boolean;
export declare function isAdminPasswordConfigured(): boolean;
export declare function loginAdmin(username: string, password: string, meta?: {
    ip?: string;
    userAgent?: string;
    totpCode?: string;
}): AdminSession | null;
export declare function resolveSession(token: string | undefined): AdminSession | null;
export declare function recordFailedLogin(username: string, meta?: {
    ip?: string;
    userAgent?: string;
}): void;
export declare function clearFailedLogins(username: string): void;
export declare function getFailedLoginCount(username?: string): number;
export declare function recordIngestError(deviceId?: string): void;
export declare function getIngestErrorCount(): number;
export declare function logoutAdmin(userId: string, meta?: {
    ip?: string;
    userAgent?: string;
    tokenId?: string;
}): void;
