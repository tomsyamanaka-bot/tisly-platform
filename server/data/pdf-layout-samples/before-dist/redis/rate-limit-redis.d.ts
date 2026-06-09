import type { NextFunction, Request, Response } from "express";
export type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => void;
export interface RateLimitOptions {
    keyPrefix: string;
    max: number;
    windowMs: number;
    keyFn?: (req: Request) => string;
}
export declare function createRateLimit(opts: RateLimitOptions): RateLimitMiddleware;
export declare function getRateLimitProviderName(): string;
export declare function isRedisReachable(): Promise<boolean>;
export declare function isRedisReachableSync(): boolean;
