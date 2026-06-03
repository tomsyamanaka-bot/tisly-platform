import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyticsRouter } from "./api/routes/analytics.js";
import { authRouter } from "./api/routes/auth.js";
import { dashboardRouter } from "./api/routes/dashboard.js";
import { demoRouter } from "./api/routes/demo.js";
import { devicesRouter } from "./api/routes/devices.js";
import { eventsRouter } from "./api/routes/events.js";
import { heartbeatRouter } from "./api/routes/heartbeat.js";
import { notificationsRouter } from "./api/routes/notifications.js";
import { qnapRouter } from "./api/routes/qnap.js";
import { recoveryRouter } from "./api/routes/recovery.js";
import { settingsRouter } from "./api/routes/settings.js";
import { socNocRouter } from "./api/routes/soc-noc.js";
import { opsDataRouter } from "./api/routes/ops-data.js";
import { billingRouter } from "./api/routes/billing.js";
import { testRouter } from "./api/routes/test.js";
import { tvRouter } from "./api/routes/tv.js";
import { sitesRouter } from "./api/routes/sites.js";
import { provisioningRouter } from "./api/routes/provisioning.js";
import { tenantsRouter } from "./api/routes/tenants.js";
import { reportsRouter } from "./api/routes/reports.js";
import { healthFullRouter } from "./api/routes/health-full.js";
import { customersRouter } from "./api/routes/customers.js";
import { customerPortalRouter } from "./api/routes/customer-portal.js";
import { customerUsersRouter } from "./api/routes/customer-users.js";
import { customerReportsRouter } from "./api/routes/customer-reports.js";
import { customerWebhooksRouter } from "./api/routes/customer-webhooks.js";
import { customerNotificationRulesRouter } from "./api/routes/customer-notification-rules.js";
import {
  customerSiteBuilderRouter,
  floorApiRouter,
  mapApiRouter,
  siteApiRouter,
  zoneApiRouter,
} from "./api/routes/site-builder.js";
import { customerInstallerRouter } from "./api/routes/installer.js";
import { incidentsRouter } from "./api/routes/incidents.js";
import { opsCustomerScopeMiddleware } from "./ops/ops-customer-scope.js";
import { attachCustomerFromSubdomain } from "./customer/subdomain-resolver.js";
import { dbRouter } from "./api/routes/db.js";
import { notificationRulesRouter } from "./api/routes/notification-rules.js";
import { securityRouter } from "./api/routes/security.js";
import { requireAdminAuth } from "./auth/auth-middleware.js";
import { tenantQueryGuard } from "./auth/tenant-guard.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

export function createApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(attachCustomerFromSubdomain);
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );

  app.use("/api/auth", authRouter);

  app.use("/api/events", opsCustomerScopeMiddleware, tenantQueryGuard, eventsRouter);
  app.use("/api/notifications", opsCustomerScopeMiddleware, tenantQueryGuard, notificationsRouter);
  app.use("/api/devices", opsCustomerScopeMiddleware, tenantQueryGuard, devicesRouter);
  app.use("/api/heartbeat", heartbeatRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/analytics", opsCustomerScopeMiddleware, analyticsRouter);
  app.use("/api/test", testRouter);

  app.use("/api/settings", requireAdminAuth, settingsRouter);
  app.use("/api/recovery", requireAdminAuth, opsCustomerScopeMiddleware, tenantQueryGuard, recoveryRouter);
  app.use("/api/qnap", requireAdminAuth, opsCustomerScopeMiddleware, tenantQueryGuard, qnapRouter);
  app.use("/api/ops", requireAdminAuth, socNocRouter);
  app.use("/api/ops", requireAdminAuth, opsDataRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/sites", requireAdminAuth, sitesRouter);
  app.use("/api/site", requireAdminAuth, siteApiRouter);
  app.use("/api/floor", requireAdminAuth, floorApiRouter);
  app.use("/api/zone", requireAdminAuth, zoneApiRouter);
  app.use("/api/map", requireAdminAuth, mapApiRouter);
  app.use("/api/provisioning", requireAdminAuth, provisioningRouter);
  app.use("/api/tenants", requireAdminAuth, tenantsRouter);
  app.use("/api/reports", requireAdminAuth, reportsRouter);
  app.use("/api/notification-rules", requireAdminAuth, notificationRulesRouter);
  app.use("/api/security", securityRouter);

  app.use("/api/tv", opsCustomerScopeMiddleware, tenantQueryGuard, tvRouter);
  app.use("/api/health", healthFullRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/customer", customerPortalRouter);
  app.use("/api/customer", customerUsersRouter);
  app.use("/api/customer", customerReportsRouter);
  app.use("/api/customer", customerWebhooksRouter);
  app.use("/api/customer", customerNotificationRulesRouter);
  app.use("/api/customer", customerSiteBuilderRouter);
  app.use("/api/customer", customerInstallerRouter);
  app.use("/api/incidents", incidentsRouter);
  app.use("/api/db", dbRouter);

  const customerPortalHtml = path.join(publicDir, "customer-portal.html");
  const tvDashboardHtml = path.join(publicDir, "tv-dashboard.html");
  const adminCustomerHtml = path.join(publicDir, "admin-customer.html");

  app.get("/customer/:customerCode", (_req, res) => {
    res.sendFile(customerPortalHtml);
  });
  app.get("/customer/:customerCode/map", (_req, res) => {
    res.sendFile(path.join(publicDir, "map-editor.html"));
  });
  app.get("/customer/:customerCode/install", (_req, res) => {
    res.sendFile(path.join(publicDir, "installer-mode.html"));
  });
  app.use(
    "/uploads/floorplans",
    express.static(path.join(process.cwd(), "uploads", "floorplans"))
  );
  app.get("/tv/:customerCode", (_req, res) => {
    res.sendFile(tvDashboardHtml);
  });
  app.get("/admin/:customerCode", (_req, res) => {
    res.sendFile(adminCustomerHtml);
  });
  app.get("/customer", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-index.html"));
  });

  app.get("/setup", (_req, res) => {
    res.sendFile(path.join(publicDir, "setup.html"));
  });

  app.get("/recovery", (_req, res) => {
    res.sendFile(path.join(publicDir, "recovery.html"));
  });

  app.get("/operations", (_req, res) => {
    res.sendFile(path.join(publicDir, "operations.html"));
  });

  app.get("/analytics", (_req, res) => {
    res.sendFile(path.join(publicDir, "analytics.html"));
  });

  app.get("/sales", (_req, res) => {
    res.sendFile(path.join(publicDir, "sales.html"));
  });

  app.get("/manifest.webmanifest", (_req, res) => {
    res.sendFile(path.join(publicDir, "manifest.webmanifest"));
  });

  app.get("/service-worker.js", (_req, res) => {
    res.setHeader("Service-Worker-Allowed", "/");
    res.sendFile(path.join(publicDir, "service-worker.js"));
  });

  app.use(express.static(publicDir));

  app.get("/notifications", (_req, res) => {
    res.sendFile(path.join(publicDir, "notifications.html"));
  });

  app.get("/settings", (_req, res) => {
    res.sendFile(path.join(publicDir, "settings.html"));
  });

  app.get("/tv", (_req, res) => {
    res.sendFile(path.join(publicDir, "tv-preview.html"));
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "tisly-notification-platform",
      phase: config.rc1Phase,
      platform: "production-infrastructure-foundation",
      demoMode: config.demoMode,
      features: [
        "pro-remote-customers",
        "customer-portal-urls",
        "customer-jwt-rbac",
        "google-tv-dashboard-web",
        "infrastructure-health-full-api",
        "admin-jwt-auth",
        "session-revocation",
        "device-secret-validation",
        "ingest-idempotency",
        "hmac-event-signature",
        "replay-protection",
        "postgres-pool-reconnect",
        "redis-rate-limit-replay-cache",
        "totp-2fa-otplib",
        "siem-loki-elastic-syslog",
        "db-provider-sqlite-postgres",
        "sqlite-to-postgres-migrate",
        "infrastructure-health-tab",
        "ingest-secret-validation",
        "audit-log-enhanced",
        "secret-rotation",
        "tv-pairing-limits",
        "qnap-retention-purge",
        "scheduled-backup",
        "api-rate-limiting",
        "health-monitor-full",
        "operations-security-tab",
        "recovery-confirm-guard",
        "report-export-audit",
      ],
    });
  });

  return app;
}
