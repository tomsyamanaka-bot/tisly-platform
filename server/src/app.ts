import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyticsRouter } from "./api/routes/analytics.js";
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
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

export function createApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/events", eventsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/heartbeat", heartbeatRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/recovery", recoveryRouter);
  app.use("/api/qnap", qnapRouter);
  app.use("/api/ops", socNocRouter);
  app.use("/api/test", testRouter);
  app.use("/api/tv", tvRouter);

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
      phase: "121-140",
      platform: "production-device-connection",
      demoMode: config.demoMode,
      features: [
        "ai-analytics",
        "recovery-engine",
        "qnap-archive",
        "soc-noc",
        "device-registry",
        "test-api",
        "unified-mqtt",
        "tv-pairing",
        "mqtt-subscriber",
        "plc-modbus-map",
      ],
    });
  });

  return app;
}
