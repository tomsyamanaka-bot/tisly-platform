import { Router } from "express";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { getDatabase } from "../../db/database.js";
import {
  getQnapIntegrationOverview,
  archiveEventsToFile,
  runScheduledBackup,
  autoExport,
  exportAsExcelCompatible,
  generateCustomerReport,
} from "../../qnap/qnap-client.js";
import { config } from "../../config.js";

export const qnapRouter = Router();

const ARCHIVE_DIR = path.join(process.cwd(), "data", "qnap-archive");

function ensureArchiveDir(): string {
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  return ARCHIVE_DIR;
}

qnapRouter.get("/status", (_req, res) => {
  const overview = getQnapIntegrationOverview();
  res.json({
    ...overview,
    mockMode: !process.env.QNAP_HOST,
    phase: "101-120",
  });
});

qnapRouter.post("/test", (_req, res) => {
  const host = process.env.QNAP_HOST ?? "";
  const connected = Boolean(host);
  res.json({
    ok: true,
    connected,
    mock: !connected,
    host: connected ? host : "(未設定)",
    latencyMs: connected ? null : 8,
    smbReachable: false,
    message: connected
      ? "QNAP_HOST 設定あり — 実機 SMB/API 検証は Phase 121 以降"
      : "モック: ローカル data/qnap-archive に保存します",
    archiveDir: path.join(process.cwd(), "data", "qnap-archive"),
    publicUrl: config.publicUrl,
  });
});

qnapRouter.post("/archive/event", (req, res) => {
  const event = req.body?.event ?? req.body;
  if (!event || typeof event !== "object") {
    res.status(400).json({ error: "event object required" });
    return;
  }

  const dir = ensureArchiveDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const deviceId = (event.device_id as string) ?? (event.deviceId as string) ?? "unknown";
  const filename = `event-${deviceId}-${stamp}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(event, null, 2), "utf8");

  const db = getDatabase();
  const id = uuid();
  db.prepare(
    `INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, 'single_event', 'json', ?, 1, datetime('now'))`
  ).run(id, filepath);

  res.status(201).json({
    ok: true,
    mock: !process.env.QNAP_HOST,
    filePath: filepath,
    archiveId: id,
  });
});

qnapRouter.post("/archive/report", (req, res) => {
  const type = (req.body?.type ?? "weekly") as "weekly" | "monthly";
  if (!["weekly", "monthly"].includes(type)) {
    res.status(400).json({ error: "type must be weekly|monthly" });
    return;
  }

  const report = generateCustomerReport(type);
  const dir = ensureArchiveDir();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `report-${type}-${stamp}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), "utf8");

  const db = getDatabase();
  const id = uuid();
  db.prepare(
    `INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, ?, 'json', ?, 1, datetime('now'))`
  ).run(id, `report_${type}`, filepath);

  res.status(201).json({
    ok: true,
    mock: !process.env.QNAP_HOST,
    type,
    filePath: filepath,
    report,
    archiveId: id,
  });
});

qnapRouter.post("/archive", (req, res) => {
  const format = (req.body?.format ?? "json") as "json" | "csv";
  const days = Number(req.body?.days ?? 1);
  const filePath = archiveEventsToFile(format, days);
  res.json({ ok: true, filePath, mock: !process.env.QNAP_HOST });
});

qnapRouter.post("/backup/:schedule", (req, res) => {
  const schedule = req.params.schedule as "daily" | "weekly" | "monthly";
  if (!["daily", "weekly", "monthly"].includes(schedule)) {
    res.status(400).json({ error: "invalid schedule" });
    return;
  }
  res.json({ ...runScheduledBackup(schedule), mock: !process.env.QNAP_HOST });
});

qnapRouter.post("/export", (req, res) => {
  const format = (req.body?.format ?? "json") as "json" | "csv";
  const days = Number(req.body?.days ?? 7);
  if (format === "csv") {
    res.json({ ...exportAsExcelCompatible(days), mock: !process.env.QNAP_HOST });
    return;
  }
  res.json({ ...autoExport(format, days), mock: !process.env.QNAP_HOST });
});

qnapRouter.get("/report/:type", (req, res) => {
  const type = req.params.type as "weekly" | "monthly";
  if (!["weekly", "monthly"].includes(type)) {
    res.status(400).json({ error: "type must be weekly|monthly" });
    return;
  }
  res.json({ ...generateCustomerReport(type), mock: !process.env.QNAP_HOST });
});
