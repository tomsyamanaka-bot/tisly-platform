import { Redis } from "ioredis";
export declare function getRedisClient(): Redis | null;
export declare function pingRedis(): Promise<boolean>;
export declare function isRedisReachableSync(): boolean;
export declare function getRedisLastError(): string | null;
export declare function closeRedis(): Promise<void>;
export declare function resetRedisForTests(): void;
