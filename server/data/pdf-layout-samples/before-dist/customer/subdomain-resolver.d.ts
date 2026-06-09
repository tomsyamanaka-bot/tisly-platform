import type { NextFunction, Request, Response } from "express";
export declare function resolveCustomerCodeFromHost(host: string): string | null;
export declare function resolveCustomerCodeFromRequest(req: Request): string | null;
export declare function attachCustomerFromSubdomain(req: Request, _res: Response, next: NextFunction): void;
