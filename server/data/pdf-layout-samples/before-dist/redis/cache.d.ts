export declare function cacheGet(key: string): Promise<string | null>;
export declare function cacheSet(key: string, value: string, ttlSec?: number): Promise<void>;
export declare function cacheDel(key: string): Promise<void>;
export declare function resetCacheForTests(): void;
