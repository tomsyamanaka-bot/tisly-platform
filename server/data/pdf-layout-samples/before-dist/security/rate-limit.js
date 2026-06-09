const buckets = new Map();
/** In-memory rate limiter — TODO: Redis for multi-instance production */
export function rateLimit(opts) {
    return (req, res, next) => {
        const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
        const extra = opts.keyFn?.(req) ?? "";
        const key = `${opts.keyPrefix}:${ip}:${extra}`;
        const now = Date.now();
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + opts.windowMs };
            buckets.set(key, bucket);
        }
        bucket.count += 1;
        if (bucket.count > opts.max) {
            res.status(429).json({
                error: "Too many requests",
                retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
            });
            return;
        }
        next();
    };
}
export function resetRateLimitsForTests() {
    buckets.clear();
}
