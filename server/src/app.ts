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
import { testRouter } from "./api/routes/test.js";
import { tvRouter } from "./api/routes/tv.js";
import { sitesRouter } from "./api/routes/sites.js";
import { provisioningRouter } from "./api/routes/provisioning.js";
import { tenantsRouter } from "./api/routes/tenants.js";
import { reportsRouter } from "./api/routes/reports.js";
import { healthFullRouter } from "./api/routes/health-full.js";
import { notificationRulesRouter } from "./api/routes/notification-rules.js";
import { securityRouter } from "./api/routes/security.js";
import { requireAdminAuth } from "./auth/auth-middleware.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

export function createApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRouter);

  app.use("/api/events", eventsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/heartbeat", heartbeatRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/test", testRouter);

  app.use("/api/settings", requireAdminAuth, settingsRouter);
  app.use("/api/recovery", requireAdminAuth, recoveryRouter);
  app.use("/api/qnap", requireAdminAuth, qnapRouter);
  app.use("/api/ops", requireAdminAuth, socNocRouter);
  app.use("/api/sites", requireAdminAuth, sitesRouter);
  app.use("/api/provisioning", requireAdminAuth, provisioningRouter);
  app.use("/api/tenants", requireAdminAuth, tenantsRouter);
  app.use("/api/reports", requireAdminAuth, reportsRouter);
  app.use("/api/notification-rules", requireAdminAuth, notificationRulesRouter);
  app.use("/api/security", securityRouter);

  app.use("/api/tv", tvRouter);
  app.use("/api/health", healthFullRouter);

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
      phase: "161-180-security-rc1",
      platform: "security-hardened-rc1",
      demoMode: config.demoMode,
      features: [
        "admin-jwt-auth",
        "device-secret-validation",
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
