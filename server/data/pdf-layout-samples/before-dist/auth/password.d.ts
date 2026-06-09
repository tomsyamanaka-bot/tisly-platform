export declare function normalizeStoredPasswordHash(stored: string): string;
export declare function isValidScryptPasswordHash(stored: string | undefined): boolean;
export declare function hashPassword(password: string): string;
export declare function verifyPassword(password: string, stored: string): boolean;
