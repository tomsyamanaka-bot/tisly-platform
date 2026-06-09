import type { NextFunction, Request, Response } from "express";
export interface ReplayRequest extends Request {
    rawBody?: string;
}
export declare function requireReplayProtection(req: ReplayRequest, res: Response, next: NextFunction): void;
