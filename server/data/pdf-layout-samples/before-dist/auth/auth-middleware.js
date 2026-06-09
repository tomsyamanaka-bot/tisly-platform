import { isAdminPasswordConfigured, isAuthConfigured, resolveSession } from "./admin-auth.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { canAccessCustomer, resolveAnySession } from "./customer-auth.js";
import { isSessionRevoked } from "./session-store.js";
import { roleMeetsRequirement } from "./roles.js";
function extractBearer(req) {
    const auth = req.header("authorization");
    if (auth?.startsWith("Bearer "))
        return auth.slice(7).trim();
    const queryToken = req.query.access_token;
    if (typeof queryToken === "string" && queryToken.trim())
        return queryToken.trim();
    return req.header("x-tisly-admin-token") ?? undefined;
}
export function requireAdminAuth(req, res, next) {
    if (!isAdminPasswordConfigured()) {
        res.status(503).json({
            error: "Admin authentication not configured",
            hint: "Set JWT_SECRET and ADMIN_PASSWORD_HASH in .env",
        });
        return;
    }
    const token = extractBearer(req);
    const session = resolveSession(token);
    if (!session) {
        res.status(401).json({ error: "Unauthorized — admin token required" });
        return;
    }
    if (session.tokenId && isSessionRevoked(session.tokenId)) {
        res.status(401).json({ error: "Session revoked or expired" });
        return;
    }
    req.admin = {
        userId: session.userId,
        username: session.username,
        role: session.role,
        tokenId: session.tokenId,
        scope: "platform",
    };
    next();
}
export function requireAuth(minRole = "viewer") {
    return (req, res, next) => {
        if (!isAuthConfigured()) {
            res.status(503).json({ error: "Authentication not configured" });
            return;
        }
        const token = extractBearer(req);
        const session = resolveAnySession(token);
        if (!session) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        if ("tokenId" in session && session.tokenId && isSessionRevoked(session.tokenId)) {
            res.status(401).json({ error: "Session revoked" });
            return;
        }
        const effectiveRole = session.role === "admin" && (!("scope" in session) || session.scope === "platform")
            ? "super_admin"
            : session.role;
        if (!roleMeetsRequirement(effectiveRole, minRole)) {
            res.status(403).json({ error: "Insufficient role", required: minRole });
            return;
        }
        req.admin = {
            userId: session.userId,
            username: session.username,
            role: session.role,
            tokenId: "tokenId" in session ? session.tokenId : undefined,
            customerId: "customerId" in session ? session.customerId : undefined,
            customerCode: "customerCode" in session ? session.customerCode : undefined,
            scope: "scope" in session ? session.scope : "platform",
        };
        next();
    };
}
export function requireCustomerAccess(paramKey = "customerCode") {
    return (req, res, next) => {
        const code = (req.params[paramKey] ?? req.query.customerCode);
        if (!req.admin) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        if (!code && req.admin.customerId) {
            next();
            return;
        }
        if (!code) {
            res.status(400).json({ error: "customerCode required" });
            return;
        }
        const customer = getCustomerByCode(code);
        if (!customer) {
            res.status(404).json({ error: "Customer not found" });
            return;
        }
        if (!canAccessCustomer(req.admin, customer.customer_id)) {
            res.status(403).json({ error: "Customer access denied" });
            return;
        }
        next();
    };
}
export function optionalAdminAuth(req, _res, next) {
    const token = extractBearer(req);
    const session = resolveAnySession(token) ?? resolveSession(token);
    if (session) {
        const cust = session;
        req.admin = {
            userId: session.userId,
            username: session.username,
            role: session.role,
            customerId: cust.customerId,
            customerCode: cust.customerCode,
            scope: cust.scope ?? "platform",
        };
    }
    next();
}
