import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import {
  getBranding,
  getCustomerByCode,
  getDashboardSummary,
  listDevicesForCustomer,
  listSitesForCustomer,
} from "../../customer/customer-store.js";
import { buildCustomerSalesReport } from "../../customer/customer-reports.js";
import { requirePlanFeature } from "../../customer/plan-guard.js";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { requireTenantMatch } from "../../auth/tenant-guard.js";
import { canAccessCustomer } from "../../auth/customer-auth.js";
import { config } from "../../config.js";

export const customerPortalRouter = Router();
const portalAuth = [requireAuth("viewer"), requireTenantMatch("customerCode")] as const;

function resolveCustomer(req: AuthedRequest, code: string) {
  const customer = getCustomerByCode(code);
  if (!customer) return null;
  if (req.admin && !canAccessCustomer(req.admin, customer.customer_id)) return null;
  return customer;
}

function tenantScope(customer: { customer_id: string; tenant_id: string | null }) {
  return customer.tenant_id ?? customer.customer_id;
}

customerPortalRouter.get("/:customerCode/dashboard", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(req.admin ? 403 : 404).json({ error: "Not found or denied" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "customer_portal", res)) return;
  const summary = getDashboardSummary(customer.customer_id);
  const branding = getBranding(customer.customer_id);
  const sites = listSitesForCustomer(customer.customer_id);
  res.json({
    customer: {
      customerId: customer.customer_id,
      customerCode: customer.customer_code,
      customerName: customer.customer_name,
      plan: customer.plan,
    },
    branding,
    summary,
    sites,
    cards: {
      deviceCount: summary.deviceCount,
      onlineCount: summary.onlineCount,
      offlineCount: summary.offlineCount,
      notificationCount: summary.notificationCount,
      lastEvent: summary.lastEvent,
      overallStatus: summary.overallStatus,
      uptimePercent:
        summary.deviceCount > 0
          ? Math.round((summary.onlineCount / summary.deviceCount) * 1000) / 10
          : 100,
    },
  });
});

customerPortalRouter.get("/:customerCode/sites", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  const sites = listSitesForCustomer(customer.customer_id);
  const db = getDatabase();
  const enriched = sites.map((s) => {
    const alarm = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM events WHERE site_id = ? AND severity IN ('critical','alarm')
           AND created_at > datetime('now', '-1 hour')`
        )
        .get(s.site_id) as { c: number }
    ).c;
    return { ...s, status: alarm > 0 ? "alarm" : "normal" };
  });
  res.json({ sites: enriched });
});

customerPortalRouter.get("/:customerCode/devices", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  const devices = listDevicesForCustomer(customer.customer_id);
  const byType = ["PLC", "RP2350", "ESP32", "TV", "Gateway"] as const;
  const grouped = Object.fromEntries(
    byType.map((t) => [t, devices.filter((d) => d.deviceType.toUpperCase() === t)])
  );
  res.json({ devices, grouped });
});

customerPortalRouter.get("/:customerCode/events", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const tid = tenantScope(customer);
  const events = getDatabase()
    .prepare(
      `SELECT id, created_at, event_type, severity, site_id,
              COALESCE(message, title, '') as message
       FROM events
       WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(tid, customer.customer_id, limit);
  res.json({ events });
});

customerPortalRouter.get("/:customerCode/alarms", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  const tid = tenantScope(customer);
  const alarms = getDatabase()
    .prepare(
      `SELECT id, created_at, event_type, severity, site_id,
              COALESCE(message, title, '') as message
       FROM events
       WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
         AND severity IN ('critical', 'alarm', 'warning')
       ORDER BY created_at DESC LIMIT 50`
    )
    .all(tid, customer.customer_id);
  res.json({ alarms });
});

customerPortalRouter.get("/:customerCode/recovery", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "recovery", res)) return;
  const tid = tenantScope(customer);
  let history: unknown[] = [];
  try {
    history = getDatabase()
      .prepare(
        `SELECT id, created_at, status, playbook_id, site_id, device_id
         FROM recovery_incidents WHERE tenant_id = ?
         ORDER BY created_at DESC LIMIT 20`
      )
      .all(tid);
  } catch {
    history = [];
  }
  res.json({ recoveryHistory: history });
});

customerPortalRouter.get("/:customerCode/ai-summary", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  const report = buildCustomerSalesReport(customer.customer_id);
  res.json({
    summary: report.aiComment,
    riskLevel: report.alarmCount > 3 ? "high" : report.alarmCount > 0 ? "medium" : "low",
    improvements: report.improvements.slice(0, 3),
  });
});

customerPortalRouter.get("/:customerCode/sales-report", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "sales_report", res)) return;
  const report = buildCustomerSalesReport(customer.customer_id);
  res.json({
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    exportId: `sales-${customer.customer_code}-${Date.now()}`,
    ...report,
    generatedAt: new Date().toISOString(),
    format: (req.query.format as string) ?? "json",
    pdfTodo: "Full PDF generation scheduled — use HTML export for now",
  });
});

customerPortalRouter.get(
  "/:customerCode/sales-report.html",
  ...portalAuth,
  (req: AuthedRequest, res) => {
    const customer = resolveCustomer(req, String(req.params.customerCode));
    if (!customer) {
      res.status(403).send("Denied");
      return;
    }
    if (!requirePlanFeature(customer.plan, "sales_report", res)) return;
    const report = buildCustomerSalesReport(customer.customer_id);
    const sites = listSitesForCustomer(customer.customer_id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><title>月報 ${customer.customer_name}</title></head><body>
<h1>${customer.customer_name} — 月次レポート</h1>
<p>期間: ${report.period.from} — ${report.period.to}</p>
<p>現場: ${sites.map((s) => s.site_name).join(", ")}</p>
<ul><li>月間イベント: ${report.monthlyEvents}</li><li>警報: ${report.alarmCount}</li>
<li>復旧: ${report.recoveryCount}</li><li>稼働率: ${report.uptimePercent}%</li></ul>
<p><strong>AI:</strong> ${report.aiComment}</p>
<p><strong>改善:</strong> ${report.improvements.join(" / ")}</p>
</body></html>`);
  }
);

customerPortalRouter.get("/:customerCode/tv", ...portalAuth, (req: AuthedRequest, res) => {
  const customer = resolveCustomer(req, String(req.params.customerCode));
  if (!customer) {
    res.status(403).json({ error: "Denied" });
    return;
  }
  if (!requirePlanFeature(customer.plan, "tv_dashboard", res)) return;
  const devices = listDevicesForCustomer(customer.customer_id);
  const summary = getDashboardSummary(customer.customer_id);
  const branding = getBranding(customer.customer_id);
  const sites = listSitesForCustomer(customer.customer_id);
  const db = getDatabase();
  const tid = tenantScope(customer);
  const alerts = db
    .prepare(
      `SELECT id, created_at, event_type, severity, COALESCE(message, title, '') as message
       FROM events
       WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
         AND severity IN ('critical', 'alarm', 'warning')
       ORDER BY created_at DESC LIMIT 5`
    )
    .all(tid, customer.customer_id) as Array<{
    id: string;
    created_at: string;
    event_type: string;
    severity: string;
    message: string;
  }>;

  let recoveryStatus = "idle";
  try {
    const open = db
      .prepare(
        `SELECT COUNT(*) as c FROM recovery_incidents WHERE tenant_id = ? AND status IN ('open','running')`
      )
      .get(tid) as { c: number };
    if (open.c > 0) recoveryStatus = "active";
  } catch {
    recoveryStatus = "n/a";
  }

  res.json({
    customer,
    branding,
    summary,
    sites: sites.map((s) => ({ ...s, status: "normal" })),
    devices,
    tvDevices: devices.filter((d) => d.deviceType.toUpperCase() === "TV"),
    cameras: devices.filter((d) => ["ESP32", "PLC"].includes(d.deviceType.toUpperCase())),
    alerts,
    recoveryStatus,
    certPinning: {
      enabled: config.tv.certPinningEnabled,
      fingerprint: config.tv.certFingerprint,
    },
    refreshSec: 15,
    alertFullscreenSec: 10,
  });
});
