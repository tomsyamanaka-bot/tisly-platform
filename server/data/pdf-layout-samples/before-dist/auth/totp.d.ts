export interface TotpSetupResult {
    secret: string;
    otpauthUrl: string;
    qrDataUrl: string;
    mock: false;
}
export declare function setupTotp(userId: string): Promise<TotpSetupResult>;
export declare function verifyTotpCode(userId: string, code: string): boolean;
export declare function enableTotp(userId: string, code: string): boolean;
export declare function disableTotp(userId: string, code?: string): boolean;
export declare function isTotpEnabled(userId: string): boolean;
export declare function isRequire2fa(): boolean;
export declare function adminRequires2fa(userId: string): boolean;
/** @deprecated use verifyTotpCode */
export declare function verifyTotp(userId: string, code: string): boolean;
