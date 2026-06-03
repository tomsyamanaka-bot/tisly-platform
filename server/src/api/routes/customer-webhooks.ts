import { Router } from "express";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requireNotificationChannel } from "../../notification/channel-plan-guard.js";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  sendWebhookTest,
} from "../../notification/channels/webhook.js";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { logAudit } from "../../provisioning/audit-log.js";

export const customerWebhooksRouter = Router();

function resolve(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

customerWebhooksRouter.post(
  "/:customerCode/webhooks",
  requireAuth("admin"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).json({ error: "Denied" });
      return;
    }
    if (!requireNotificationChannel(customer.plan, "webhook", res)) return;
    const { url, secret } = req.body as { url?: string; secret?: string };
    if (!url?.trim()) {
      res.status(400).json({ error: "url required" });
      return;
    }
    const wh = createWebhook(customer.customer_id, url.trim(), secret);
    logAudit({
      tenantId: customer.customer_id,
      userId: req.admin!.userId,
      actorLabel: req.admin!.username,
      action: "webhook.create",
      targetType: "webhook",
      targetId: wh.id,
      afterJson: { url: wh.url },
      ipAddress: req.ip,
    });
    res.status(201).json({ webhook: { id: wh.id, url: wh.url, enabled: wh.enabled } });
  }
);

customerWebhooksRouter.get(
  "/:customerCode/webhooks",
  requireAuth("manager"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).json({ error: "Denied" });
      return;
    }
    if (!requireNotificationChannel(customer.plan, "webhook", res)) return;
    res.json({ webhooks: listWebhooks(customer.customer_id).map((w) => ({
      id: w.id,
      url: w.url,
      enabled: w.enabled,
      created_at: w.created_at,
    })) });
  }
);

customerWebhooksRouter.post(
  "/:customerCode/webhooks/:id/test",
  requireAuth("admin"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).json({ error: "Denied" });
      return;
    }
    if (!requireNotificationChannel(customer.plan, "webhook", res)) return;
    const wh = getWebhook(customer.customer_id, String(req.params.id));
    if (!wh) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }
    void sendWebhookTest(wh).then((result) => {
      logAudit({
        tenantId: customer.customer_id,
        userId: req.admin!.userId,
        actorLabel: req.admin!.username,
        action: "webhook.test",
        targetType: "webhook",
        targetId: wh.id,
        afterJson: result,
        ipAddress: req.ip,
      });
      res.json(result);
    });
  }
);

customerWebhooksRouter.delete(
  "/:customerCode/webhooks/:id",
  requireAuth("admin"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = resolve(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).json({ error: "Denied" });
      return;
    }
    if (!requireNotificationChannel(customer.plan, "webhook", res)) return;
    const ok = deleteWebhook(customer.customer_id, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }
    logAudit({
      tenantId: customer.customer_id,
      userId: req.admin!.userId,
      actorLabel: req.admin!.username,
      action: "webhook.delete",
      targetType: "webhook",
      targetId: String(req.params.id),
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  }
);
