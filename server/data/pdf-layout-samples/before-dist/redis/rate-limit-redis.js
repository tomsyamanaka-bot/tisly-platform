import { config } from "../config.js";
import { getRedisClient, pingRedis } from "./redis-client.js";
import { rateLimit as memoryRateLimit } from "../security/rate-limit.js";
function redisRateLimit(opts) {
    return async (req, res, next) => {
        const r = getRedisClient();
        if (!r || !(await pingRedis())) {
            return memoryRateLimit(opts)(req, res, next);
        }
        const ip = req.ip ?? "unknown";
        const extra = opts.keyFn ? opts.keyFn(req) : "";
        const key = `rl:${opts.keyPrefix}:${ip}:${extra}`;
        try {
            const count = await r.incr(key);
            if (count === 1)
                await r.pexpire(key, opts.windowMs);
            if (count > opts.max) {
                res.status(429).json({
                    error: "Too many requests",
                    retryAfterMs: opts.windowMs,
                });
                return;
            }
            next();
        }
        catch {
            memoryRateLimit(opts)(req, res, next);
        }
    };
}
export function createRateLimit(opts) {
    if (config.rateLimitProvider === "redis") {
        return redisRateLimit(opts);
    }
    return memoryRateLimit(opts);
}
export function getRateLimitProviderName() {
    return config.rateLimitProvider;
}
export async function isRedisReachable() {
    if (config.rateLimitProvider !== "redis")
        return false;
    return pingRedis();
}
export function isRedisReachableSync() {
    return config.rateLimitProvider === "redis";
}
