import type { NextFunction, Request, Response } from "express";
import { type AppRole } from "./roles.js";
import type { OpsScopeLocals } from "../ops/ops-customer-scope.js";
export interface AuthedRequest extends Request {
    opsScope?: OpsScopeLocals;
    admin?: {
        userId: string;
        username: string;
        role: string;
        tokenId?: string;
        customerId?: string;
        customerCode?: string;
        scope?: "platform" | "customer";
    };
}
export declare function requireAdminAuth(req: AuthedRequest, res: Response, next: NextFunction): void;
export declare function requireAuth(minRole?: AppRole): (req: AuthedRequest, res: Response, next: NextFunction) => void;
export declare function requireCustomerAccess(paramKey?: string): (req: AuthedRequest, res: Response, next: NextFunction) => void;
export declare function optionalAdminAuth(req: AuthedRequest, _res: Response, next: NextFunction): void;
