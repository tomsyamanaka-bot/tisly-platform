import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { dashboardRouter } from "./api/routes/dashboard.js";
import { devicesRouter } from "./api/routes/devices.js";
import { eventsRouter } from "./api/routes/events.js";
import { heartbeatRouter } from "./api/routes/heartbeat.js";
import { notificationsRouter } from "./api/routes/notifications.js";
import { settingsRouter } from "./api/routes/settings.js";
import { getDatabase } from "./db/database.js";
import { getNotificationService } from "./notification/notification-service.js";

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

app.use(express.static(publicDir));

app.get("/notifications", (_req, res) => {
  res.sendFile(path.join(publicDir, "notifications.html"));
});

app.get("/settings", (_req, res) => {
  res.sendFile(path.join(publicDir, "settings.html"));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "tisly-notification-platform" });
});

const service = getNotificationService();
service.start();

app.listen(config.port, config.host, () => {
  console.log(`[TiSLY] https://tisly.jp — listening on http://${config.host}:${config.port}`);
});
