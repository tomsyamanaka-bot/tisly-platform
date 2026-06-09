import type { CustomerRole } from "./types.js";
export interface CustomerUserRow {
    id: string;
    customer_id: string;
    username: string;
    role: CustomerRole;
    status: string;
    last_login_at: string | null;
    invite_expires_at: string | null;
    invited_at: string | null;
    accepted_at: string | null;
    disabled_at: string | null;
    created_at: string;
}
export declare function listCustomerUsers(customerId: string): CustomerUserRow[];
export declare function canInviteUsers(role: string): boolean;
export declare function inviteCustomerUser(input: {
    customerCode: string;
    username: string;
    role: CustomerRole;
    invitedByUserId: string;
    invitedByLabel: string;
    ip?: string;
}): {
    userId: string;
    inviteToken: string;
    expiresAt: string;
    acceptUrl: string;
    emailPreview: string;
    emailSent: false;
} | {
    error: string;
};
export declare function reinviteCustomerUser(input: {
    customerId: string;
    userId: string;
    invitedByUserId: string;
    invitedByLabel: string;
    ip?: string;
}): {
    inviteToken: string;
    expiresAt: string;
} | {
    error: string;
};
export declare function acceptCustomerInvite(input: {
    customerCode: string;
    inviteToken: string;
    password: string;
    ip?: string;
}): {
    userId: string;
    username: string;
} | {
    error: string;
};
export declare function disableCustomerUser(input: {
    customerId: string;
    userId: string;
    actorUserId: string;
    actorLabel: string;
    ip?: string;
}): boolean;
export declare function updateCustomerUserRole(input: {
    customerId: string;
    userId: string;
    role: CustomerRole;
    actorUserId: string;
    actorLabel: string;
    ip?: string;
}): boolean;
