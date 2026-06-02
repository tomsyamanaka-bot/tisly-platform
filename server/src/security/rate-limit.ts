import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** In-memory rate limiter — TODO: Redis for multi-instance production */
export function rateLimit(opts: {
  keyPrefix: string;
  max: number;
  windowMs: number;
  keyFn?: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
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

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
