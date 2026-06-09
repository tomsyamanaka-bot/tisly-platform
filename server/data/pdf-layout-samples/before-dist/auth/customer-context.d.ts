import type { Request } from "express";
export interface CustomerContext {
    customerId: string;
    customerCode: string;
    tenantId: string;
    /** For PostgreSQL RLS: SET app.current_customer_id = ? */
    rlsCustomerId: string;
}
/**
 * Resolves customer scope from request (subdomain, header, param, session).
 * Pass to DB helpers; PostgreSQL migration will use rlsCustomerId for SET LOCAL.
 */
export declare function resolveCustomerContext(req: Request & {
    resolvedCustomerCode?: string;
    tenantCustomerId?: string;
    tenantId?: string;
}, paramCode?: string): CustomerContext | null;
/** SQL fragment params for tenant isolation (SQLite app layer). */
export declare function customerScopeSql(ctx: CustomerContext): {
    sql: string;
    params: string[];
};
/** Placeholder for Postgres pool: await client.query('SET app.current_customer_id = $1', [ctx.rlsCustomerId]) */
export declare function postgresRlsSetStatement(ctx: CustomerContext): {
    sql: string;
    params: string[];
};
