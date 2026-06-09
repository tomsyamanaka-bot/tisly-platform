export declare function validateCustomerPasswordPolicy(password: string): string | null;
export declare function isCustomerUserLocked(userId: string): boolean;
export declare function getCustomerFailedLoginCount(userId: string): number;
export declare function recordCustomerFailedLogin(userId: string, customerId: string, username: string, meta?: {
    ip?: string;
    userAgent?: string;
}): {
    locked: boolean;
    attempts: number;
};
export declare function clearCustomerFailedLogins(userId: string): void;
