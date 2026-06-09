import pg from "pg";
export declare function getPostgresConnectionString(): string;
export declare function getPgPool(): pg.Pool | null;
export declare function pingPostgres(): Promise<boolean>;
export declare function getPostgresLastError(): string | null;
export declare function reconnectPostgres(): Promise<boolean>;
export declare function closePostgresPool(): Promise<void>;
export declare function resetPostgresPoolForTests(): void;
