import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth-middleware.js";
/**
 * Ensures authenticated users cannot access another customer's data via URL params.
 */
export declare function requireTenantMatch(paramKey?: string): (req: AuthedRequest, res: Response, next: NextFunction) => void;
/**
 * Validates tenant_id / customer_id in query/body against the session customer.
 */
export declare function assertTenantScope(session: {
    scope?: string;
    customerId?: string;
    role: string;
}, tenantOrCustomerId: string | undefined): boolean;
export declare function tenantQueryGuard(req: AuthedRequest, res: Response, next: NextFunction): void;
