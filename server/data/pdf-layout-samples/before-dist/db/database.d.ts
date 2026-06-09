import Database from "better-sqlite3";
/** Close SQLite handle (for isolated tests). */
export declare function closeDatabase(): void;
export declare function getDbPath(): string;
export declare function getDatabase(): Database.Database;
export declare function getPlatformSetting<T>(key: string): T | null;
export declare function setPlatformSetting(key: string, value: unknown): void;
