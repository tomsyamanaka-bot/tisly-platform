import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../auth/auth-middleware.js";
export interface OpsScopeLocals {
    customerCode: string;
    customerId?: string;
    tenantId?: string;
}
/** Admin ops: optional ?customerCode= filter (non-ALL enforces scope). */
export declare function opsCustomerScopeMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void;
export declare function customerFilterClause(tableAlias: string, opsScope: OpsScopeLocals | undefined): {
    sql: string;
    params: string[];
};
