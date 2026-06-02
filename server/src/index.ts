import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { dashboardRouter } from "./api/routes/dashboard.js";
import { devicesRouter } from "./api/routes/devices.js";
import { eventsRouter } from "./api/routes/events.js";
import { heartbeatRouter } from "./api/routes/heartbeat.js";
import { notificationsRouter } from "./api/routes/notifications.js";
import { settingsRouter } from "./api/routes/settings.js";
import { demoRouter } from "./api/routes/demo.js";
import { analyticsRouter } from "./api/routes/analytics.js";
import { recoveryRouter } from "./api/routes/recovery.js";
import { qnapRouter } from "./api/routes/qnap.js";
import { socNocRouter } from "./api/routes/soc-noc.js";
import { startDemoRunner } from "./demo/demo-runner.js";
import { startRecoveryEngine } from "./recovery/recovery-engine.js";
import { config } from "./config.js";
import { getDatabase } from "./db/database.js";
import { getNotificationService } from "./notification/notification-service.js";
import { registerWsClient } from "./ws/hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();
app.use(cors());
app.use(express.json());

getDatabase();

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
    phase: config.demoMode ? "81-100" : "81-100",
    platform: "operations-recovery",
    demoMode: config.demoMode,
    features: ["ai-analytics", "recovery-engine", "qnap-archive", "soc-noc"],
  });
});

startRecoveryEngine();
const service = getNotificationService();
service.start();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  registerWsClient(socket);
});

server.listen(config.port, config.host, () => {
  console.log(
    `[TiSLY] ${config.publicUrl} — listening on http://${config.host}:${config.port} (ws: /ws)`
  );
  if (config.demoMode && config.demoAutoStart) {
    void startDemoRunner();
  }
});
