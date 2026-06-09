import { scopeFromCustomerCode } from "../incidents/incident-store.js";
import { getCustomerByCode } from "../customer/customer-store.js";
/** Admin ops: optional ?customerCode= filter (non-ALL enforces scope). */
export function opsCustomerScopeMiddleware(req, res, next) {
    const code = String(req.query.customerCode ?? req.query.customer ?? "ALL").toUpperCase();
    if (code === "ALL") {
        req.opsScope = { customerCode: "ALL" };
        next();
        return;
    }
    const scope = scopeFromCustomerCode(code);
    if (scope === null) {
        res.status(404).json({ error: "Customer not found" });
        return;
    }
    const customer = getCustomerByCode(code);
    req.opsScope = {
        customerCode: code,
        customerId: customer.customer_id,
        tenantId: customer.tenant_id ?? customer.customer_id,
    };
    next();
}
export function customerFilterClause(tableAlias, opsScope) {
    if (!opsScope?.customerId)
        return { sql: "1=1", params: [] };
    const col = tableAlias ? `${tableAlias}.customer_id` : "customer_id";
    const ten = tableAlias ? `${tableAlias}.tenant_id` : "tenant_id";
    return {
        sql: `(${col} = ? OR ${ten} = ?)`,
        params: [opsScope.customerId, opsScope.tenantId],
    };
}
