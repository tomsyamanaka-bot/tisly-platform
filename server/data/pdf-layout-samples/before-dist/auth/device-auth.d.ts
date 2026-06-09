import type { NextFunction, Request, Response } from "express";
export declare function verifyDeviceSecret(deviceId: string, secret: string): boolean;
export declare function verifyIngestSecret(secret: string | undefined): boolean;
export declare function requireIngestOrDeviceAuth(req: Request, res: Response, next: NextFunction): void;
