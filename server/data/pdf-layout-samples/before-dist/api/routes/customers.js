import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { customerUrls, getBranding, getCustomerByCode, listCustomers, listDevicesForCustomer, listSitesForCustomer, upsertCustomer, } from "../../customer/customer-store.js";
import { requireAdminAuth, requireAuth } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canChangeCustomerSettings } from "../../auth/roles.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { logAudit } from "../../provisioning/audit-log.js";
import { listPlanFeatures } from "../../customer/plan-guard.js";
import { getBillingByCustomerId } from "../../billing/billing-store.js";
import { createSite } from "../../site-builder/site-store.js";
export const customersRouter = Router();
customersRouter.get("/", requireAdminAuth, (_req, res) => {
    res.json({ customers: listCustomers(false) });
});
customersRouter.get("/by-code/:customerCode", requireAuth("viewer"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Customer not found" });
        return;
    }
    const branding = getBranding(customer.customer_id);
    const billing = getBillingByCustomerId(customer.customer_id);
    res.json({
        customer,
        branding,
        urls: customerUrls(customer.customer_code),
        sites: listSitesForCustomer(customer.customer_id),
        planFeatures: listPlanFeatures(customer.plan),
        billing: billing
            ? {
                plan: billing.plan,
                subscription_status: billing.subscription_status ?? "none",
                next_billing_date: billing.next_billing_date,
                stripe_customer_id: billing.stripe_customer_id,
                stripe_subscription_id: billing.stripe_subscription_id,
                last_invoice_status: billing.last_invoice_status,
                contract_status: billing.contract_status ?? "active",
                placeholder: "Billing charges not live until Stripe keys configured",
            }
            : null,
    });
});
customersRouter.post("/wizard", requireAdminAuth, (req, res) => {
    const body = req.body;
    if (body.complete && body.company) {
        const row = upsertCustomer({
            customerId: body.company.customerId,
            customerCode: body.company.customerCode,
            customerName: body.company.customerName,
            plan: body.plan ?? body.company.plan ?? "Standard",
        });
        let site = null;
        if (body.site?.name) {
            site = createSite({
                tenantId: row.tenant_id ?? row.customer_id,
                customerId: row.customer_id,
                name: body.site.name,
                address: body.site.address,
                timezone: body.site.timezone,
            });
        }
        res.status(201).json({ step: 5, customer: row, site, urls: customerUrls(row.customer_code) });
        return;
    }
    res.json({
        steps: ["company", "plan", "site", "contacts", "complete"],
        message: "Send complete:true with company, plan, site, user to finalize",
    });
});
customersRouter.post("/", requireAdminAuth, (req, res) => {
    const { customerId, customerCode, customerName, plan, branding } = req.body;
    if (!customerId || !customerCode || !customerName) {
        res.status(400).json({ error: "customerId, customerCode, customerName required" });
        return;
    }
    const row = upsertCustomer({
        customerId,
        customerCode,
        customerName,
        plan: plan ?? "Standard",
        branding,
    });
    res.status(201).json({ customer: row, urls: customerUrls(row.customer_code) });
});
customersRouter.patch("/:customerCode", requireAuth("admin"), requireTenantMatch("customerCode"), (req, res) => {
    if (!req.admin || !canChangeCustomerSettings(req.admin.role)) {
        res.status(403).json({ error: "Insufficient role for settings change" });
        return;
    }
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Customer not found" });
        return;
    }
    const body = req.body;
    const row = upsertCustomer({
        customerId: customer.customer_id,
        customerCode: customer.customer_code,
        customerName: body.customerName ?? customer.customer_name,
        plan: body.plan ?? customer.plan,
        status: body.status ?? customer.status,
        branding: body.branding,
    });
    logAudit({
        tenantId: customer.customer_id,
        userId: req.admin.userId,
        actorLabel: req.admin.username,
        action: "customer.update",
        targetType: "customer",
        targetId: customer.customer_id,
        afterJson: body,
        ipAddress: req.ip,
    });
    res.json({ customer: row, branding: getBranding(customer.customer_id) });
});
customersRouter.get("/:customerCode/users", requireAuth("manager"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    const users = getDatabase()
        .prepare(`SELECT id, username, role, status, last_login_at, failed_login_count, created_at,
                invite_expires_at, invited_at, accepted_at, disabled_at
         FROM customer_users WHERE customer_id = ? AND status != 'deleted' ORDER BY username`)
        .all(customer.customer_id);
    res.json({
        users,
        plan: customer.plan,
        status: customer.status,
        planFeatures: listPlanFeatures(customer.plan),
        contractNote: "PRO Remote 契約詳細は営業担当へ — placeholder",
    });
});
customersRouter.get("/:customerCode/audit", requireAuth("manager"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    const logs = getDatabase()
        .prepare(`SELECT id, created_at, action, actor_label, target_type, target_id, ip_address
         FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`)
        .all(customer.customer_id);
    res.json({ auditLogs: logs });
});
customersRouter.get("/:customerCode/tv-devices", requireAuth("viewer"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    const tid = customer.tenant_id ?? customer.customer_id;
    let tvs = [];
    try {
        tvs = getDatabase()
            .prepare(`SELECT id, device_id, site_id, status, paired_at, display_name, tenant_id
           FROM tv_devices WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)`)
            .all(tid, customer.customer_id);
    }
    catch {
        tvs = listDevicesForCustomer(customer.customer_id).filter((d) => d.deviceType.toUpperCase() === "TV");
    }
    res.json({ tvDevices: tvs });
});
customersRouter.get("/:customerCode/devices", requireAuth("viewer"), requireTenantMatch("customerCode"), (req, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
        res.status(404).json({ error: "Customer not found" });
        return;
    }
    if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) {
        res.status(403).json({ error: "Denied" });
        return;
    }
    res.json({ devices: listDevicesForCustomer(customer.customer_id) });
});
