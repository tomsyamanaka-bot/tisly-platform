import type { NextFunction, Request, Response } from "express";
/** In-memory rate limiter — TODO: Redis for multi-instance production */
export declare function rateLimit(opts: {
    keyPrefix: string;
    max: number;
    windowMs: number;
    keyFn?: (req: Request) => string;
}): (req: Request, res: Response, next: NextFunction) => void;
export declare function resetRateLimitsForTests(): void;
