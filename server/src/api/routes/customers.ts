import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import {
  customerUrls,
  getBranding,
  getCustomerByCode,
  listCustomers,
  listDevicesForCustomer,
  listSitesForCustomer,
  upsertCustomer,
} from "../../customer/customer-store.js";
import type { CustomerPlan, CustomerStatus } from "../../customer/types.js";
import { requireAdminAuth, requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canChangeCustomerSettings } from "../../auth/roles.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { logAudit } from "../../provisioning/audit-log.js";
import { listPlanFeatures } from "../../customer/plan-guard.js";

export const customersRouter = Router();

customersRouter.get("/", requireAdminAuth, (_req, res) => {
  res.json({ customers: listCustomers(false) });
});

customersRouter.get("/by-code/:customerCode", requireAuth("viewer"), requireTenantMatch("customerCode"), (req: AuthedRequest, res) => {
  const customer = getCustomerByCode(String(req.params.customerCode));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const branding = getBranding(customer.customer_id);
  res.json({
    customer,
    branding,
    urls: customerUrls(customer.customer_code),
    sites: listSitesForCustomer(customer.customer_id),
    planFeatures: listPlanFeatures(customer.plan),
  });
});

customersRouter.post("/", requireAdminAuth, (req, res) => {
  const { customerId, customerCode, customerName, plan, branding } = req.body as {
    customerId?: string;
    customerCode?: string;
    customerName?: string;
    plan?: CustomerPlan;
    branding?: { logoUrl?: string; companyColor?: string; companyName?: string };
  };
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

customersRouter.patch(
  "/:customerCode",
  requireAuth("admin"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    if (!req.admin || !canChangeCustomerSettings(req.admin.role)) {
      res.status(403).json({ error: "Insufficient role for settings change" });
      return;
    }
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const body = req.body as {
      plan?: CustomerPlan;
      status?: CustomerStatus;
      customerName?: string;
      branding?: { logoUrl?: string; companyColor?: string; companyName?: string };
    };
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
  }
);

customersRouter.get(
  "/:customerCode/users",
  requireAuth("manager"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const users = getDatabase()
      .prepare(
        `SELECT id, username, role, status, last_login_at, failed_login_count, created_at,
                invite_expires_at, invited_at, accepted_at, disabled_at
         FROM customer_users WHERE customer_id = ? AND status != 'deleted' ORDER BY username`
      )
      .all(customer.customer_id);
    res.json({
      users,
      plan: customer.plan,
      status: customer.status,
      planFeatures: listPlanFeatures(customer.plan),
      contractNote: "PRO Remote 契約詳細は営業担当へ — placeholder",
    });
  }
);

customersRouter.get(
  "/:customerCode/audit",
  requireAuth("manager"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const logs = getDatabase()
      .prepare(
        `SELECT id, created_at, action, actor_label, target_type, target_id, ip_address
         FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(customer.customer_id);
    res.json({ auditLogs: logs });
  }
);

customersRouter.get(
  "/:customerCode/tv-devices",
  requireAuth("viewer"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
    const customer = getCustomerByCode(String(req.params.customerCode));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tid = customer.tenant_id ?? customer.customer_id;
    let tvs: unknown[] = [];
    try {
      tvs = getDatabase()
        .prepare(
          `SELECT id, device_id, site_id, status, paired_at, display_name, tenant_id
           FROM tv_devices WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)`
        )
        .all(tid, customer.customer_id);
    } catch {
      tvs = listDevicesForCustomer(customer.customer_id).filter(
        (d) => d.deviceType.toUpperCase() === "TV"
      );
    }
    res.json({ tvDevices: tvs });
  }
);

customersRouter.get(
  "/:customerCode/devices",
  requireAuth("viewer"),
  requireTenantMatch("customerCode"),
  (req: AuthedRequest, res) => {
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
  }
);
