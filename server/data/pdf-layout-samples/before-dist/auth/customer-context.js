import { getCustomerByCode, getCustomerById } from "../customer/customer-store.js";
/**
 * Resolves customer scope from request (subdomain, header, param, session).
 * Pass to DB helpers; PostgreSQL migration will use rlsCustomerId for SET LOCAL.
 */
export function resolveCustomerContext(req, paramCode) {
    const code = paramCode ??
        req.params.customerCode ??
        req.params.code ??
        req.query.customerCode ??
        req.resolvedCustomerCode;
    if (code) {
        const customer = getCustomerByCode(String(code).toUpperCase());
        if (!customer)
            return null;
        return {
            customerId: customer.customer_id,
            customerCode: customer.customer_code,
            tenantId: customer.tenant_id ?? customer.customer_id,
            rlsCustomerId: customer.customer_id,
        };
    }
    const authed = req;
    if (authed.admin?.scope === "customer" && authed.admin.customerId) {
        const customer = getCustomerById(authed.admin.customerId);
        if (!customer)
            return null;
        return {
            customerId: customer.customer_id,
            customerCode: customer.customer_code,
            tenantId: customer.tenant_id ?? customer.customer_id,
            rlsCustomerId: customer.customer_id,
        };
    }
    if (req.tenantCustomerId) {
        const customer = getCustomerById(req.tenantCustomerId);
        if (!customer)
            return null;
        return {
            customerId: customer.customer_id,
            customerCode: customer.customer_code,
            tenantId: req.tenantId ?? customer.tenant_id ?? customer.customer_id,
            rlsCustomerId: customer.customer_id,
        };
    }
    return null;
}
/** SQL fragment params for tenant isolation (SQLite app layer). */
export function customerScopeSql(ctx) {
    return {
        sql: "(customer_id = ? OR tenant_id = ?)",
        params: [ctx.customerId, ctx.tenantId],
    };
}
/** Placeholder for Postgres pool: await client.query('SET app.current_customer_id = $1', [ctx.rlsCustomerId]) */
export function postgresRlsSetStatement(ctx) {
    return {
        sql: "SET LOCAL app.current_customer_id = ?",
        params: [ctx.rlsCustomerId],
    };
}
