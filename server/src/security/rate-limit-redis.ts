import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { rateLimit as memoryRateLimit } from "./rate-limit.js";

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

/**
 * Rate limit provider factory.
 * memory: in-process Map (default)
 * redis: TODO — connect REDIS_URL and use INCR + EXPIRE
 */
export function createRateLimit(opts: RateLimitOptions): RateLimitMiddleware {
  if (config.rateLimitProvider === "redis") {
    // TODO: implement RedisRateLimitStore with ioredis/redis client
    console.warn("[rate-limit] Redis provider not yet implemented — falling back to memory");
  }
  return memoryRateLimit(opts);
}

export function getRateLimitProviderName(): string {
  return config.rateLimitProvider;
}

export function isRedisReachable(): boolean {
  if (config.rateLimitProvider !== "redis") return false;
  // TODO: PING redis when driver connected
  return false;
}
