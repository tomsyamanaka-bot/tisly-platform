import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyticsRouter } from "./api/routes/analytics.js";
import { authRouter } from "./api/routes/auth.js";
import { dashboardRouter } from "./api/routes/dashboard.js";
import { demoRouter } from "./api/routes/demo.js";
import { demoKitRouter } from "./api/routes/demo-kit.js";
import { deploymentKitRouter } from "./api/routes/deployment-kit.js";
import { deploymentMqttRouter } from "./api/routes/deployment-mqtt.js";
import { customerOnboardingRouter } from "./api/routes/customer-onboarding.js";
import { shellyRouter } from "./api/routes/shelly.js";
import { devicesRouter } from "./api/routes/devices.js";
import { eventsRouter } from "./api/routes/events.js";
import { heartbeatRouter } from "./api/routes/heartbeat.js";
import { notificationsRouter } from "./api/routes/notifications.js";
import { PWA_MANIFEST_ICONS } from "./pwa/pwa-manifest-icons.js";
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
import { deviceCommissioningRouter } from "./api/routes/device-commissioning.js";
import { incidentsRouter } from "./api/routes/incidents.js";
import { opsCustomerScopeMiddleware } from "./ops/ops-customer-scope.js";
import { attachCustomerFromSubdomain } from "./customer/subdomain-resolver.js";
import { dbRouter } from "./api/routes/db.js";
import { notificationRulesRouter } from "./api/routes/notification-rules.js";
import { securityRouter } from "./api/routes/security.js";
import { requireAdminAuth } from "./auth/auth-middleware.js";
import { tenantQueryGuard } from "./auth/tenant-guard.js";
import { config } from "./config.js";
import { rejectInstallerRestricted } from "./auth/installer-restricted-guard.js";
import { pwaHubRouter } from "./api/routes/pwa-hub.js";
import { surveyRouter } from "./api/routes/survey.js";
import { surveyV1Router } from "./api/routes/survey-v1.js";
import { estimateV1Router } from "./api/routes/estimate-v1.js";
import { scheduleRouter } from "./api/routes/schedule.js";
import { googleCalendarRouter } from "./api/routes/google-calendar.js";
import { googleCalendarDebugRouter } from "./api/routes/google-calendar-debug.js";
import { handleCalendarOAuthCallback } from "./services/googleCalendar.js";
import {
  buildGoogleCalendarOAuthSettingsRedirectQuery,
  getGoogleCalendarAuthUrl,
  GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
  parseGoogleOAuthReturnTarget,
  resolveGoogleOAuthReturnPath,
} from "./services/googleOAuthService.js";
import { projectsV1Router } from "./api/routes/projects-v1.js";
import { projectMgmtV1Router } from "./api/routes/project-mgmt-v1.js";
import { projectTimelineV1Router } from "./api/routes/project-timeline-v1.js";
import { dashboardV1Router } from "./api/routes/dashboard-v1.js";
import { projectStatusV1Router } from "./api/routes/project-status-v1.js";
import { projectStorageV1Router } from "./api/routes/project-storage-v1.js";
import { searchV1Router } from "./api/routes/search-v1.js";
import { materialsV1Router } from "./api/routes/materials-v1.js";
import { fieldCheckV1Router } from "./api/routes/field-check-v1.js";
import { purchaseV1Router } from "./api/routes/purchase-v1.js";
import { workSessionV1Router } from "./api/routes/work-session-v1.js";
import { fieldChecklistV1Router } from "./api/routes/field-checklist-v1.js";
import { businessRouter } from "./api/routes/business.js";
import { tomsRouter } from "./api/routes/toms.js";
import { maintenanceProductionRouter } from "./api/routes/maintenance-production.js";
import { aiRouter } from "./api/routes/ai.js";
import { assetsRouter } from "./api/routes/assets.js";
import { timelineRouter } from "./api/routes/timeline.js";
import { proRemoteFloorMapRouter } from "./api/routes/pro-remote-floor-map.js";
import { fieldRouter } from "./api/routes/field.js";
import { fieldOperationsRouter } from "./api/routes/field-operations.js";
import { deploymentRc2Router } from "./api/routes/deployment-rc2.js";
import { deployRouter } from "./api/routes/deploy.js";
import { switchbotIntegrationRouter } from "./api/routes/switchbot-integration.js";
import { securityAutomationRouter } from "./api/routes/security-automation.js";
import { buildSurveyReportHtml } from "./survey/survey-report.js";
import { remoteTestRouter } from "./api/routes/remote-test.js";
import { pushRouter } from "./api/routes/push.js";
import { storageSettingsV1Router } from "./api/routes/storage-settings-v1.js";
import { qnapStorageV1Router } from "./api/routes/qnap-storage-v1.js";
import { documentsV1Router } from "./api/routes/documents-v1.js";
import { projectAutomationV1Router } from "./api/routes/project-automation-v1.js";
import { masterV1Router } from "./api/routes/master-v1.js";
import { knowledgeV1Router } from "./api/routes/knowledge-v1.js";
import { aiEstimateEngineV1Router } from "./api/routes/ai-estimate-engine-v1.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

export function createApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(attachCustomerFromSubdomain);
  app.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );

  app.use("/api/auth", authRouter);
  app.use("/api/pwa", pwaHubRouter);
  app.use("/api/survey", surveyRouter);
  app.use("/api/survey/v1", surveyV1Router);
  app.use("/api/estimate/v1", estimateV1Router);
  app.use("/api/schedule/v1", scheduleRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/google-calendar", googleCalendarRouter);
  app.use("/api/debug/google-calendar", googleCalendarDebugRouter);

  app.get("/auth/google", (req, res) => {
    const returnTo = parseGoogleOAuthReturnTarget(String(req.query.return ?? ""));
    const auth = getGoogleCalendarAuthUrl(returnTo);
    if (!auth.configured || !auth.url) {
      res.redirect(
        `${auth.returnPath}?error=${encodeURIComponent(GOOGLE_CALENDAR_NOT_CONFIGURED_MSG)}`
      );
      return;
    }
    res.redirect(auth.url);
  });

  app.get("/auth/google/callback", async (req, res) => {
    const result = await handleCalendarOAuthCallback({
      code: req.query.code as string | undefined,
      error: req.query.error as string | undefined,
      error_description: req.query.error_description as string | undefined,
    });
    const query = buildGoogleCalendarOAuthSettingsRedirectQuery(result);
    const returnPath = resolveGoogleOAuthReturnPath(String(req.query.state ?? ""));
    res.redirect(`${returnPath}?${query}`);
  });
  app.use("/api/projects/v1", projectsV1Router);
  app.use("/api/project-mgmt/v1", projectMgmtV1Router);
  app.use("/api/project-timeline-v1", projectTimelineV1Router);
  app.use("/api/dashboard-v1", dashboardV1Router);
  app.use("/api/project-status-v1", projectStatusV1Router);
  app.use("/api/project-storage", projectStorageV1Router);
  app.use("/api/search/v1", searchV1Router);
  app.use("/api/materials/v1", materialsV1Router);
  app.use("/api/field-check/v1", fieldCheckV1Router);
  app.use("/api/purchase/v1", purchaseV1Router);
  app.use("/api/work-session/v1", workSessionV1Router);
  app.use("/api/field-checklist/v1", fieldChecklistV1Router);
  app.use("/api/storage/v1/settings", storageSettingsV1Router);
  app.use("/api/storage/qnap", qnapStorageV1Router);
  app.use("/api/documents/v1", documentsV1Router);
  app.use("/api/master/v1", masterV1Router);
  app.use("/api/knowledge", knowledgeV1Router);
  app.use("/api/ai-estimate-engine/v1", aiEstimateEngineV1Router);
  app.use("/api/project-automation/v1", projectAutomationV1Router);
  app.use("/api/business", businessRouter);
  app.use("/api/toms", tomsRouter);
  app.use("/api/maintenance", maintenanceProductionRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/timeline", timelineRouter);
  app.use("/api/field", fieldRouter);
  app.use("/api/field-operations", fieldOperationsRouter);
  app.use("/api/deployment", deploymentRc2Router);
  app.use("/api/deploy", deployRouter);
  app.use("/api/integrations/switchbot", switchbotIntegrationRouter);

  app.use("/api/events", opsCustomerScopeMiddleware, tenantQueryGuard, eventsRouter);
  app.use("/api/notifications", opsCustomerScopeMiddleware, tenantQueryGuard, notificationsRouter);
  app.use("/api/devices", opsCustomerScopeMiddleware, tenantQueryGuard, devicesRouter);
  app.use("/api/heartbeat", heartbeatRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/demo-kit", demoKitRouter);
  app.use("/api/deployment-kit", deploymentKitRouter);
  app.use("/api/deployment/mqtt", deploymentMqttRouter);
  app.use("/api/customer-onboarding", customerOnboardingRouter);
  app.use("/api/shelly", shellyRouter);
  app.use("/api/analytics", opsCustomerScopeMiddleware, analyticsRouter);
  app.use("/api/test", testRouter);
  app.use("/api/remote-test", remoteTestRouter);
  app.use("/api/push", pushRouter);

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
  app.use("/api/security", securityAutomationRouter);
  app.use("/api/security", securityRouter);

  app.use("/api/tv", opsCustomerScopeMiddleware, tenantQueryGuard, tvRouter);
  app.use("/api/health", healthFullRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/customer", rejectInstallerRestricted);
  app.use("/api/customer", customerPortalRouter);
  app.use("/api/customer", customerUsersRouter);
  app.use("/api/customer", customerReportsRouter);
  app.use("/api/customer", customerWebhooksRouter);
  app.use("/api/customer", customerNotificationRulesRouter);
  app.use("/api/customer", customerSiteBuilderRouter);
  app.use("/api/customer", customerInstallerRouter);
  app.use("/api/customer", proRemoteFloorMapRouter);
  app.use("/api/customer", deviceCommissioningRouter);
  app.use("/api/incidents", incidentsRouter);
  app.use("/api/db", dbRouter);

  const customerPortalHtml = path.join(publicDir, "customer-portal.html");
  const tvDashboardHtml = path.join(publicDir, "tv-dashboard.html");
  const adminCustomerHtml = path.join(publicDir, "admin-customer.html");

  app.get("/customer-portal", (_req, res) => {
    res.redirect("/customer/TOMS001");
  });
  app.get("/customer-portal/:customerCode", (req, res) => {
    res.redirect(`/customer/${String(req.params.customerCode)}`);
  });

  app.get("/customer/new", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-new.html"));
  });

  app.get("/onboarding/new", (_req, res) => {
    res.sendFile(path.join(publicDir, "onboarding-new.html"));
  });

  app.get("/customer/:customerCode", (_req, res) => {
    res.sendFile(customerPortalHtml);
  });
  app.get("/customer/:customerCode/map", (_req, res) => {
    res.sendFile(path.join(publicDir, "map-editor.html"));
  });
  app.get("/customer/:customerCode/deploy", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-deploy.html"));
  });
  app.get("/customer/:customerCode/install", (_req, res) => {
    res.sendFile(path.join(publicDir, "installer-mode.html"));
  });
  app.get("/customer/:customerCode/install/home", (_req, res) => {
    res.sendFile(path.join(publicDir, "installer-home.html"));
  });
  app.get("/customer/:customerCode/install/guide", (_req, res) => {
    res.sendFile(path.join(publicDir, "install-guide.html"));
  });
  app.get("/customer/:customerCode/install/manifest.webmanifest", (req, res) => {
    const code = String(req.params.customerCode).toUpperCase();
    res.type("application/manifest+json");
    res.send(
      JSON.stringify(
        {
          name: "TiSLY 施工 PWA",
          short_name: "TiSLY施工",
          description: "TiSLY 施工員専用 — 現場設置・QR・Map・オフライン同期",
          start_url: `/customer/${code}/install/home`,
          scope: "/",
          display: "standalone",
          background_color: "#0d1117",
          theme_color: "#1a7f37",
          orientation: "portrait-primary",
          icons: [...PWA_MANIFEST_ICONS],
        },
        null,
        2
      )
    );
  });
  app.get("/customer/:customerCode/install/device-onboard", (_req, res) => {
    res.sendFile(path.join(publicDir, "device-onboard.html"));
  });
  app.get("/app", (_req, res) => {
    res.sendFile(path.join(publicDir, "app-hub.html"));
  });
  app.get("/app/push", (_req, res) => {
    res.sendFile(path.join(publicDir, "app-push.html"));
  });
  app.get("/remote-test", (_req, res) => {
    res.sendFile(path.join(publicDir, "remote-test.html"));
  });
  app.get("/remote-test/app.js", (_req, res) => {
    res.type("application/javascript");
    res.sendFile(path.join(publicDir, "js", "remote-test.js"));
  });
  app.get("/remote-test/service-worker.js", (_req, res) => {
    res.setHeader("Service-Worker-Allowed", "/remote-test/");
    res.type("application/javascript");
    res.sendFile(path.join(publicDir, "remote-test", "service-worker.js"));
  });
  app.get("/remote-test/manifest.webmanifest", (_req, res) => {
    res.type("application/manifest+json");
    res.send(
      JSON.stringify(
        {
          name: "TiSLY Remote Test",
          short_name: "Remote Test",
          description: "TiSLY 通信PoC — 通知 & 遠隔操作テスト",
          start_url: "/remote-test",
          scope: "/remote-test",
          display: "standalone",
          background_color: "#0d1117",
          theme_color: "#1a7f37",
          orientation: "portrait-primary",
          icons: [...PWA_MANIFEST_ICONS],
        },
        null,
        2
      )
    );
  });
  const tislyAppHtml = path.join(publicDir, "tisly-app.html");
  app.get("/tisly-app", (_req, res) => {
    res.redirect("/tisly-app/home");
  });
  app.get("/tisly-app/home", (_req, res) => {
    res.sendFile(tislyAppHtml);
  });
  app.get("/tisly-app/devices", (_req, res) => {
    res.sendFile(tislyAppHtml);
  });
  app.get("/tisly-app/events", (_req, res) => {
    res.sendFile(tislyAppHtml);
  });
  app.get("/tisly-app/settings", (_req, res) => {
    res.sendFile(tislyAppHtml);
  });
  app.get("/tisly-app/app.js", (_req, res) => {
    res.type("application/javascript");
    res.sendFile(path.join(publicDir, "js", "tisly-app.js"));
  });
  app.get("/tisly-app/manifest.webmanifest", (_req, res) => {
    res.type("application/manifest+json");
    res.send(
      JSON.stringify(
        {
          name: "TiSLY App",
          short_name: "TiSLY",
          description: "TiSLY PWA — Home / Devices / Events / Settings",
          start_url: "/tisly-app/home",
          scope: "/tisly-app",
          display: "standalone",
          background_color: "#0d1117",
          theme_color: "#1a7f37",
          orientation: "portrait-primary",
          icons: [...PWA_MANIFEST_ICONS],
        },
        null,
        2
      )
    );
  });
  app.get("/app/notifications", (_req, res) => {
    res.sendFile(path.join(publicDir, "app-notifications.html"));
  });
  app.get("/app/version", (_req, res) => {
    res.sendFile(path.join(publicDir, "app-version.html"));
  });
  app.get("/security", (_req, res) => {
    res.sendFile(path.join(publicDir, "security-dashboard.html"));
  });
  app.get("/security/settings/automation", (_req, res) => {
    res.sendFile(path.join(publicDir, "security-automation-settings.html"));
  });
  app.get("/project/:projectId", (_req, res) => {
    res.sendFile(path.join(publicDir, "project-dashboard.html"));
  });
  app.get("/customer-master", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-master.html"));
  });
  app.get("/customer-master/:customerId", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-master.html"));
  });
  app.get("/business/kpi", (_req, res) => {
    res.sendFile(path.join(publicDir, "business-kpi.html"));
  });
  app.get("/asset/:assetId", (_req, res) => {
    res.sendFile(path.join(publicDir, "asset-detail.html"));
  });
  app.get("/field/new", (_req, res) => {
    res.sendFile(path.join(publicDir, "field-new.html"));
  });
  app.get("/survey", (_req, res) => {
    res.sendFile(path.join(publicDir, "survey.html"));
  });
  app.get("/survey-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "survey-v1.html"));
  });
  app.get("/survey-drawing-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "survey-drawing-v1.html"));
  });
  app.get("/estimate-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "estimate-v1.html"));
  });
  app.get("/schedule-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "schedule-v1.html"));
  });
  app.get("/schedule-v1/day", (_req, res) => {
    res.sendFile(path.join(publicDir, "schedule-day-v1.html"));
  });
  app.get("/projects-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "projects-v1.html"));
  });
  app.get("/project-dashboard-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "project-dashboard-v1.html"));
  });
  app.get("/project-mgmt-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "project-mgmt-v1.html"));
  });
  app.get("/project-mgmt-detail-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "project-mgmt-detail-v1.html"));
  });
  app.get("/search-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "search-v1.html"));
  });
  app.get("/field-check-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "field-check-v1.html"));
  });
  app.get("/field-checklist-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "field-checklist-v1.html"));
  });
  app.get("/checklist-templates-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "checklist-templates-v1.html"));
  });
  app.get("/project-automation-admin-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "project-automation-admin-v1.html"));
  });
  app.get("/purchase-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "purchase-v1.html"));
  });
  app.get("/google-calendar-settings-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "google-calendar-settings-v1.html"));
  });
  app.get("/google-calendar-settings-v2", (_req, res) => {
    res.sendFile(path.join(publicDir, "google-calendar-settings-v2.html"));
  });
  app.get("/settings-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "settings-v1.html"));
  });
  app.get("/storage-settings-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "storage-settings-v1.html"));
  });
  app.get("/documents-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "documents-v1.html"));
  });
  app.get("/master-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "master-v1.html"));
  });
  app.get("/knowledge-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-v1.html"));
  });
  app.get("/knowledge-quick-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-quick-v1.html"));
  });
  app.get("/knowledge-candidates-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-candidates-v1.html"));
  });
  app.get("/mothership-explorer-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "mothership-explorer-v1.html"));
  });
  app.get("/knowledge-search-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-search-v1.html"));
  });
  app.get("/knowledge-field-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-field-v1.html"));
  });
  app.get("/knowledge-detail-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-detail-v1.html"));
  });
  app.get("/knowledge-usage-dashboard-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-usage-dashboard-v1.html"));
  });
  app.get("/knowledge-customer-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-customer-v1.html"));
  });
  app.get("/knowledge-customer-detail-v1", (_req, res) => {
    res.sendFile(path.join(publicDir, "knowledge-customer-detail-v1.html"));
  });
  app.get("/ai-estimate-engine-v1", (_req, res) => {
    res.redirect(302, "/master-v1?tab=stats");
  });
  app.get("/google-calendar-v1", (_req, res) => {
    res.redirect(301, "/google-calendar-settings-v1");
  });
  app.get("/survey/:projectId/report", (req, res) => {
    try {
      const html = buildSurveyReportHtml(String(req.params.projectId));
      res.type("html").send(html);
    } catch {
      res.status(404).send("Report not found");
    }
  });
  app.get("/maintenance", (_req, res) => {
    res.sendFile(path.join(publicDir, "maintenance.html"));
  });
  app.get("/customer/:customerCode/maintenance", (_req, res) => {
    res.sendFile(path.join(publicDir, "maintenance.html"));
  });
  app.get("/assets", (_req, res) => {
    res.sendFile(path.join(publicDir, "assets.html"));
  });
  app.get("/install", (_req, res) => {
    res.sendFile(path.join(publicDir, "install-hub.html"));
  });
  const businessHtml = path.join(publicDir, "business.html");
  const businessRoutes = [
    "/business",
    "/business/projects",
    "/business/projects/new",
    "/business/customers",
    "/business/pricing",
    "/business/settings",
    "/business/drawing-symbols",
  ];
  for (const route of businessRoutes) {
    app.get(route, (_req, res) => res.sendFile(businessHtml));
  }
  app.get("/business/projects/:projectId", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/survey", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/estimate", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/estimate-draft", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/construction", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/completion-report", (_req, res) =>
    res.sendFile(businessHtml)
  );
  app.get("/business/projects/:projectId/invoice", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/payment", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/drawing", (_req, res) => res.sendFile(businessHtml));
  app.get("/business/projects/:projectId/specification", (_req, res) =>
    res.sendFile(businessHtml)
  );
  app.get("/business/manifest.webmanifest", (_req, res) => {
    res.type("application/manifest+json");
    res.sendFile(path.join(publicDir, "manifest-business.webmanifest"));
  });
  app.get("/customer/:customerCode/pro-remote", (_req, res) => {
    res.sendFile(path.join(publicDir, "pro-remote.html"));
  });
  app.get("/customer/:customerCode/handover", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-handover.html"));
  });
  app.get("/customer/:customerCode/overview", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-overview.html"));
  });
  app.get("/customer/:customerCode/manifest.webmanifest", (req, res) => {
    const code = String(req.params.customerCode).toUpperCase();
    res.type("application/manifest+json");
    res.send(
      JSON.stringify(
        {
          name: "TiSLY 顧客ポータル",
          short_name: "TiSLY顧客",
          description: "TiSLY 顧客ポータル PWA",
          start_url: `/customer/${code}`,
          scope: `/customer/${code}`,
          display: "standalone",
          background_color: "#0f172a",
          theme_color: "#0ea5e9",
          orientation: "any",
          icons: [...PWA_MANIFEST_ICONS],
        },
        null,
        2
      )
    );
  });
  app.get("/customer/:customerCode/pro-remote/manifest.webmanifest", (req, res) => {
    const code = String(req.params.customerCode).toUpperCase();
    res.type("application/manifest+json");
    res.send(
      JSON.stringify(
        {
          name: "TiSLY PRO Remote",
          short_name: "TiSLY監視",
          description: "TiSLY PRO Remote 監視 PWA",
          start_url: `/customer/${code}/pro-remote`,
          scope: `/customer/${code}`,
          display: "standalone",
          background_color: "#0f172a",
          theme_color: "#7c3aed",
          orientation: "any",
          icons: [...PWA_MANIFEST_ICONS],
        },
        null,
        2
      )
    );
  });
  app.get("/offline", (_req, res) => {
    res.sendFile(path.join(publicDir, "offline-fallback.html"));
  });
  app.get("/install-guide", (_req, res) => {
    res.sendFile(path.join(publicDir, "install-guide.html"));
  });
  app.get("/customer/:customerCode/health", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-health.html"));
  });
  app.use(
    "/uploads/floorplans",
    express.static(path.join(process.cwd(), "uploads", "floorplans"))
  );
  app.use(
    "/uploads/install_photos",
    express.static(path.join(process.cwd(), "uploads", "install_photos"))
  );
  app.use("/customer-files", express.static(path.join(process.cwd(), "customer-files")));
  app.use(
    "/uploads/install-photos",
    express.static(path.join(process.cwd(), "uploads", "install-photos"))
  );
  app.use("/uploads/survey", express.static(path.join(process.cwd(), "uploads", "survey")));
  app.use("/uploads/business", express.static(path.join(process.cwd(), "uploads", "business")));
  app.use("/uploads/sales-demo", express.static(path.join(process.cwd(), "uploads", "sales-demo")));
  app.get("/tv/:customerCode", (_req, res) => {
    res.sendFile(tvDashboardHtml);
  });
  app.get("/admin/:customerCode", (_req, res) => {
    res.sendFile(adminCustomerHtml);
  });
  app.get("/customer", (_req, res) => {
    res.sendFile(path.join(publicDir, "customer-index.html"));
  });

  app.get("/site/new", (_req, res) => {
    res.sendFile(path.join(publicDir, "site-new.html"));
  });

  app.get("/device/provision", (_req, res) => {
    res.sendFile(path.join(publicDir, "device-provision.html"));
  });

  app.get("/deployment/checklist", (_req, res) => {
    res.sendFile(path.join(publicDir, "deployment-checklist.html"));
  });
  app.get("/deployment/checklist/:projectId", (_req, res) => {
    res.sendFile(path.join(publicDir, "deployment-checklist-rc2.html"));
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

  app.get("/operations/security", (_req, res) => {
    res.sendFile(path.join(publicDir, "operations-security.html"));
  });

  app.get("/analytics", (_req, res) => {
    res.sendFile(path.join(publicDir, "analytics.html"));
  });

  app.get("/sales", (_req, res) => {
    res.sendFile(path.join(publicDir, "sales.html"));
  });

  app.get("/sales/checklist", (_req, res) => {
    res.sendFile(path.join(publicDir, "sales-checklist.html"));
  });

  app.get("/sales/floor-preview", (_req, res) => {
    res.sendFile(path.join(publicDir, "sales-floor-preview.html"));
  });

  app.get("/devices", (_req, res) => {
    res.sendFile(path.join(publicDir, "devices.html"));
  });

  app.get("/manifest.webmanifest", (_req, res) => {
    res.sendFile(path.join(publicDir, "manifest.webmanifest"));
  });

  app.get("/service-worker.js", (_req, res) => {
    res.setHeader("Service-Worker-Allowed", "/");
    res.sendFile(path.join(publicDir, "service-worker.js"));
  });

  app.get("/sw-knowledge-field-v5.js", (_req, res) => {
    res.setHeader("Service-Worker-Allowed", "/");
    res.type("application/javascript");
    res.sendFile(path.join(publicDir, "sw-knowledge-field-v5.js"));
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

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (req.method !== "GET" || /\.\w+$/.test(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.status(404).sendFile(path.join(publicDir, "tisly-not-found.html"));
  });

  return app;
}
