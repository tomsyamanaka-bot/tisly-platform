import { Router } from "express";
import { acceptCustomerInvite, canInviteUsers, disableCustomerUser, inviteCustomerUser, listCustomerUsers, reinviteCustomerUser, updateCustomerUserRole, } from "../../customer/customer-invite.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requireAuth } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
export const customerUsersRouter = Router();
const auth = [requireAuth("viewer"), requireTenantMatch("customerCode")];
function resolve(req, code) {
    const customer = getCustomerByCode(code);
    if (!customer)
        return null;
    if (req.admin && !canAccessCustomer(req.admin, customer.customer_id))
        return null;
    return customer;
}
customerUsersRouter.get("/:customerCode/users", ...auth, (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(req.admin ? 403 : 404).json({ error: "Not found" });
        return;
    }
    const role = req.admin?.role ?? "viewer";
    res.json({
        users: listCustomerUsers(customer.customer_id),
        currentRole: role,
    });
});
customerUsersRouter.post("/:customerCode/users/invite", requireAuth("admin"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    if (!req.admin || !canInviteUsers(req.admin.role)) {
        res.status(403).json({ error: "Only owner/admin may invite users" });
        return;
    }
    const { username, role } = req.body;
    if (!username?.trim()) {
        res.status(400).json({ error: "username required" });
        return;
    }
    const result = inviteCustomerUser({
        customerCode: customer.customer_code,
        username: username.trim(),
        role: (role ?? "viewer"),
        invitedByUserId: req.admin.userId,
        invitedByLabel: req.admin.username,
        ip: req.ip,
    });
    if ("error" in result) {
        res.status(400).json(result);
        return;
    }
    res.status(201).json({
        userId: result.userId,
        inviteToken: result.inviteToken,
        expiresAt: result.expiresAt,
        acceptUrl: result.acceptUrl,
        emailPreview: result.emailPreview,
        emailSent: result.emailSent,
    });
});
customerUsersRouter.post("/:customerCode/users/:id/reinvite", requireAuth("admin"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    if (!req.admin || !canInviteUsers(req.admin.role)) {
        res.status(403).json({ error: "Only owner/admin may reinvite users" });
        return;
    }
    const result = reinviteCustomerUser({
        customerId: customer.customer_id,
        userId: String(req.params.id),
        invitedByUserId: req.admin.userId,
        invitedByLabel: req.admin.username,
        ip: req.ip,
    });
    if ("error" in result) {
        res.status(400).json(result);
        return;
    }
    res.json({
        ok: true,
        inviteToken: result.inviteToken,
        expiresAt: result.expiresAt,
        acceptUrl: `/customer/${customer.customer_code}?invite=${result.inviteToken}`,
    });
});
customerUsersRouter.post("/:customerCode/users/accept-invite", (req, res) => {
    const code = String(req.params.customerCode).toUpperCase();
    const { inviteToken, password } = req.body;
    if (!inviteToken || !password) {
        res.status(400).json({ error: "inviteToken and password required" });
        return;
    }
    const result = acceptCustomerInvite({
        customerCode: code,
        inviteToken,
        password,
        ip: req.ip,
    });
    if ("error" in result) {
        res.status(400).json(result);
        return;
    }
    res.json({ ok: true, userId: result.userId, username: result.username });
});
customerUsersRouter.post("/:customerCode/users/:id/disable", requireAuth("admin"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    if (!req.admin || !canInviteUsers(req.admin.role)) {
        res.status(403).json({ error: "Only owner/admin may disable users" });
        return;
    }
    const ok = disableCustomerUser({
        customerId: customer.customer_id,
        userId: String(req.params.id),
        actorUserId: req.admin.userId,
        actorLabel: req.admin.username,
        ip: req.ip,
    });
    if (!ok) {
        res.status(404).json({ error: "User not found or not disableable" });
        return;
    }
    res.json({ ok: true });
});
customerUsersRouter.post("/:customerCode/users/:id/role", requireAuth("admin"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    if (!req.admin || !canInviteUsers(req.admin.role)) {
        res.status(403).json({ error: "Only owner/admin may change roles" });
        return;
    }
    const { role } = req.body;
    if (!role) {
        res.status(400).json({ error: "role required" });
        return;
    }
    const ok = updateCustomerUserRole({
        customerId: customer.customer_id,
        userId: String(req.params.id),
        role,
        actorUserId: req.admin.userId,
        actorLabel: req.admin.username,
        ip: req.ip,
    });
    if (!ok) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json({ ok: true, role });
});
