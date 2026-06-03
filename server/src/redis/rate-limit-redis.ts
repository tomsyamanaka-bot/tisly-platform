import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { getRedisClient, pingRedis } from "./redis-client.js";
import { rateLimit as memoryRateLimit } from "../security/rate-limit.js";

export type RateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

export interface RateLimitOptions {
  keyPrefix: string;
  max: number;
  windowMs: number;
  keyFn?: (req: Request) => string;
}

function redisRateLimit(opts: RateLimitOptions): RateLimitMiddleware {
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
      if (count === 1) await r.pexpire(key, opts.windowMs);
      if (count > opts.max) {
        res.status(429).json({
          error: "Too many requests",
          retryAfterMs: opts.windowMs,
        });
        return;
      }
      next();
    } catch {
      memoryRateLimit(opts)(req, res, next);
    }
  };
}

export function createRateLimit(opts: RateLimitOptions): RateLimitMiddleware {
  if (config.rateLimitProvider === "redis") {
    return redisRateLimit(opts);
  }
  return memoryRateLimit(opts);
}

export function getRateLimitProviderName(): string {
  return config.rateLimitProvider;
}

export async function isRedisReachable(): Promise<boolean> {
  if (config.rateLimitProvider !== "redis") return false;
  return pingRedis();
}

export function isRedisReachableSync(): boolean {
  return config.rateLimitProvider === "redis";
}
