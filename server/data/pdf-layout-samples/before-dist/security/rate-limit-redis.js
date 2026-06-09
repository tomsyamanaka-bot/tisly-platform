/** Re-export Redis-backed rate limit (Phase 201-220) */
export { createRateLimit, getRateLimitProviderName, isRedisReachable, isRedisReachableSync, } from "../redis/rate-limit-redis.js";
import { pingRedis } from "../redis/redis-client.js";
/** Legacy sync helper for health checks */
export function isRedisReachableLegacy() {
    return false;
}
export async function checkRedisReachable() {
    return pingRedis();
}
