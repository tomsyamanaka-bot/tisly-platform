import { getCustomerByCode } from "./customer-store.js";
const DEMO_SUBDOMAINS = {
    toms001: "TOMS001",
    hotel001: "HOTEL001",
    plant001: "PLANT001",
};
export function resolveCustomerCodeFromHost(host) {
    const h = host.split(":")[0].toLowerCase();
    const parts = h.split(".");
    if (parts.length < 3)
        return null;
    const sub = parts[0];
    if (sub === "www" || sub === "api" || sub === "portal")
        return null;
    return DEMO_SUBDOMAINS[sub] ?? null;
}
export function resolveCustomerCodeFromRequest(req) {
    const header = req.header("x-tisly-customer-code") ??
        req.header("X-TiSLY-Customer-Code");
    if (header)
        return header.trim().toUpperCase();
    const query = req.query.customerCode ?? req.query.customer;
    if (typeof query === "string" && query.trim()) {
        return query.trim().toUpperCase();
    }
    const host = req.header("host") ?? req.hostname;
    if (host) {
        const fromHost = resolveCustomerCodeFromHost(host);
        if (fromHost)
            return fromHost;
    }
    return null;
}
export function attachCustomerFromSubdomain(req, _res, next) {
    const code = resolveCustomerCodeFromRequest(req);
    if (code) {
        const customer = getCustomerByCode(code);
        if (customer) {
            req.resolvedCustomerCode =
                customer.customer_code;
            req.resolvedCustomerId = customer.customer_id;
        }
    }
    next();
}
