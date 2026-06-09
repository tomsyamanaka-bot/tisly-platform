/** Re-export Redis-backed rate limit (Phase 201-220) */
export { createRateLimit, getRateLimitProviderName, isRedisReachable, isRedisReachableSync, type RateLimitMiddleware, type RateLimitOptions, } from "../redis/rate-limit-redis.js";
/** Legacy sync helper for health checks */
export declare function isRedisReachableLegacy(): boolean;
export declare function checkRedisReachable(): Promise<boolean>;
