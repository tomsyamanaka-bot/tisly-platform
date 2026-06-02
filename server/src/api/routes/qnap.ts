import { Router } from "express";
import {
  getQnapIntegrationOverview,
  archiveEventsToFile,
  runScheduledBackup,
  autoExport,
  exportAsExcelCompatible,
  generateCustomerReport,
} from "../../qnap/qnap-client.js";

export const qnapRouter = Router();

qnapRouter.get("/status", (_req, res) => {
  res.json(getQnapIntegrationOverview());
});

qnapRouter.post("/archive", (req, res) => {
  const format = (req.body?.format ?? "json") as "json" | "csv";
  const days = Number(req.body?.days ?? 1);
  const filePath = archiveEventsToFile(format, days);
  res.json({ ok: true, filePath });
});

qnapRouter.post("/backup/:schedule", (req, res) => {
  const schedule = req.params.schedule as "daily" | "weekly" | "monthly";
  if (!["daily", "weekly", "monthly"].includes(schedule)) {
    res.status(400).json({ error: "invalid schedule" });
    return;
  }
  res.json(runScheduledBackup(schedule));
});

qnapRouter.post("/export", (req, res) => {
  const format = (req.body?.format ?? "json") as "json" | "csv";
  const days = Number(req.body?.days ?? 7);
  if (format === "csv") {
    res.json(exportAsExcelCompatible(days));
    return;
  }
  res.json(autoExport(format, days));
});

qnapRouter.get("/report/:type", (req, res) => {
  const type = req.params.type as "weekly" | "monthly";
  if (!["weekly", "monthly"].includes(type)) {
    res.status(400).json({ error: "type must be weekly|monthly" });
    return;
  }
  res.json(generateCustomerReport(type));
});
