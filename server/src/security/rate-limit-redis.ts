/** Re-export Redis-backed rate limit (Phase 201-220) */
export {
  createRateLimit,
  getRateLimitProviderName,
  isRedisReachable,
  isRedisReachableSync,
  type RateLimitMiddleware,
  type RateLimitOptions,
} from "../redis/rate-limit-redis.js";

import { pingRedis } from "../redis/redis-client.js";

/** Legacy sync helper for health checks */
export function isRedisReachableLegacy(): boolean {
  return false;
}

export async function checkRedisReachable(): Promise<boolean> {
  return pingRedis();
}
