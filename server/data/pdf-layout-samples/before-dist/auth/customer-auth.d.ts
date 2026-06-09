import type { CustomerRole } from "../customer/types.js";
import { type AdminSession } from "./admin-auth.js";
export interface CustomerSession {
    userId: string;
    username: string;
    role: CustomerRole;
    customerId: string;
    customerCode: string;
    token: string;
    tokenId?: string;
    scope: "customer";
}
export declare function loginCustomer(customerCode: string, username: string, password: string, meta?: {
    ip?: string;
    userAgent?: string;
}): CustomerSession | null;
export declare function loginUnified(customerCode: string | undefined, username: string, password: string, meta?: {
    ip?: string;
    userAgent?: string;
    totpCode?: string;
}): AdminSession | CustomerSession | null;
export declare function resolveCustomerSession(token: string | undefined): CustomerSession | null;
export declare function resolveAnySession(token: string | undefined): (AdminSession & {
    scope?: "platform";
}) | CustomerSession | null;
export declare function canAccessCustomer(session: {
    role: string;
    customerId?: string;
    scope?: string;
}, customerId: string): boolean;
