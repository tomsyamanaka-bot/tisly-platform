import { Router } from "express";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { createCustomerNotificationRule, deleteCustomerNotificationRule, notificationRulesPortalPayload, updateCustomerNotificationRule, } from "../../customer/customer-notification-rules.js";
import { requireAuth } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { logAudit } from "../../provisioning/audit-log.js";
export const customerNotificationRulesRouter = Router();
const auth = [requireAuth("viewer"), requireTenantMatch("customerCode")];
function resolve(req, code) {
    const customer = getCustomerByCode(code);
    if (!customer)
        return null;
    if (req.admin && !canAccessCustomer(req.admin, customer.customer_id))
        return null;
    return customer;
}
customerNotificationRulesRouter.get("/:customerCode/notification-rules", ...auth, (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    res.json(notificationRulesPortalPayload(customer.plan, customer.customer_id));
});
customerNotificationRulesRouter.post("/:customerCode/notification-rules", requireAuth("manager"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    const body = req.body;
    if (!body.name?.trim()) {
        res.status(400).json({ error: "name required" });
        return;
    }
    const result = createCustomerNotificationRule({
        customerId: customer.customer_id,
        name: body.name.trim(),
        plan: customer.plan,
        enabled: body.enabled,
        eventTypes: body.eventTypes,
        severity: body.severity,
        channels: body.channels,
        timeStart: body.timeStart ?? null,
        timeEnd: body.timeEnd ?? null,
        daysOfWeek: body.daysOfWeek,
    });
    if ("error" in result) {
        res.status(403).json({ error: result.error, channel: result.channel, plan: customer.plan });
        return;
    }
    logAudit({
        tenantId: customer.customer_id,
        userId: req.admin.userId,
        actorLabel: req.admin.username,
        action: "notification_rule.create",
        targetType: "customer_notification_rule",
        targetId: result.rule.id,
        ipAddress: req.ip,
    });
    res.status(201).json({ ok: true, id: result.rule.id });
});
customerNotificationRulesRouter.patch("/:customerCode/notification-rules/:id", requireAuth("manager"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    const result = updateCustomerNotificationRule(customer.customer_id, String(req.params.id), customer.plan, req.body);
    if ("error" in result) {
        res.status(result.error.includes("not found") ? 404 : 403).json(result);
        return;
    }
    res.json({ ok: true });
});
customerNotificationRulesRouter.delete("/:customerCode/notification-rules/:id", requireAuth("admin"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    const ok = deleteCustomerNotificationRule(customer.customer_id, String(req.params.id));
    if (!ok) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json({ ok: true });
});
