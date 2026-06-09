export declare function ensureMigrationTable(): Promise<void>;
export declare function getAppliedMigrations(): Promise<string[]>;
export declare function recordMigration(version: string): Promise<void>;
export declare function getMigrationVersion(): Promise<string | null>;
