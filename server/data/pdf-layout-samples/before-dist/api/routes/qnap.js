import { Router } from "express";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { getDatabase } from "../../db/database.js";
import { getQnapIntegrationOverview, archiveEventsToFile, runScheduledBackup, autoExport, exportAsExcelCompatible, generateCustomerReport, } from "../../qnap/qnap-client.js";
import { getQnapConnector } from "../../qnap/qnap-connector.js";
import { getQnapSendStats, listQnapSendLogs } from "../../qnap/qnap-send-log.js";
import { config } from "../../config.js";
import { getRetentionPolicy, purgeArchives, } from "../../qnap/retention-manager.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";
export const qnapRouter = Router();
const ARCHIVE_DIR = path.join(process.cwd(), "data", "qnap-archive");
function ensureArchiveDir() {
    if (!fs.existsSync(ARCHIVE_DIR))
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    return ARCHIVE_DIR;
}
qnapRouter.get("/status", (_req, res) => {
    const overview = getQnapIntegrationOverview();
    const connector = getQnapConnector();
    const sendStats = getQnapSendStats();
    res.json({
        ...overview,
        mode: connector.mode,
        mockMode: connector.mode === "mock",
        sendStats,
        phase: "2251-2300",
    });
});
qnapRouter.post("/test", async (_req, res) => {
    const connector = getQnapConnector();
    const result = await connector.testConnection();
    res.json({
        ok: result.ok,
        mock: result.mock,
        mode: connector.mode,
        message: result.message,
        archiveDir: path.join(process.cwd(), "data", "qnap-archive"),
        publicUrl: config.publicUrl,
    });
});
qnapRouter.get("/send-logs", (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    res.json({ phase: "2251-2300", logs: listQnapSendLogs(limit), stats: getQnapSendStats() });
});
async function qnapSendRoute(type, req, res) {
    const payload = req.body?.payload ?? req.body;
    if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "payload object required" });
        return;
    }
    const connector = getQnapConnector();
    const result = await connector.send(type, payload, {
        customerCode: req.body?.customerCode,
        deviceId: payload.deviceId ?? payload.device_id,
    });
    res.status(result.ok ? 201 : 500).json({ phase: "2251-2300", type, ...result });
}
qnapRouter.post("/send/event", (req, res) => void qnapSendRoute("event", req, res));
qnapRouter.post("/send/alarm", (req, res) => void qnapSendRoute("alarm", req, res));
qnapRouter.post("/send/maintenance", (req, res) => void qnapSendRoute("maintenance", req, res));
qnapRouter.post("/send/photo", (req, res) => void qnapSendRoute("photo", req, res));
qnapRouter.post("/archive/event", (req, res) => {
    const event = req.body?.event ?? req.body;
    if (!event || typeof event !== "object") {
        res.status(400).json({ error: "event object required" });
        return;
    }
    const dir = ensureArchiveDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const deviceId = event.device_id ?? event.deviceId ?? "unknown";
    const filename = `event-${deviceId}-${stamp}.json`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2), "utf8");
    const db = getDatabase();
    const id = uuid();
    db.prepare(`INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, 'single_event', 'json', ?, 1, datetime('now'))`).run(id, filepath);
    res.status(201).json({
        ok: true,
        mock: !process.env.QNAP_HOST,
        filePath: filepath,
        archiveId: id,
    });
});
qnapRouter.post("/archive/report", (req, res) => {
    const type = (req.body?.type ?? "weekly");
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
    db.prepare(`INSERT INTO qnap_archives (id, archive_type, format, file_path, record_count, created_at)
     VALUES (?, ?, 'json', ?, 1, datetime('now'))`).run(id, `report_${type}`, filepath);
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
    const format = (req.body?.format ?? "json");
    const days = Number(req.body?.days ?? 1);
    const filePath = archiveEventsToFile(format, days);
    res.json({ ok: true, filePath, mock: !process.env.QNAP_HOST });
});
qnapRouter.post("/backup/:schedule", (req, res) => {
    const schedule = req.params.schedule;
    if (!["daily", "weekly", "monthly"].includes(schedule)) {
        res.status(400).json({ error: "invalid schedule" });
        return;
    }
    res.json({ ...runScheduledBackup(schedule), mock: !process.env.QNAP_HOST });
});
qnapRouter.post("/export", (req, res) => {
    const format = (req.body?.format ?? "json");
    const days = Number(req.body?.days ?? 7);
    if (format === "csv") {
        res.json({ ...exportAsExcelCompatible(days), mock: !process.env.QNAP_HOST });
        return;
    }
    res.json({ ...autoExport(format, days), mock: !process.env.QNAP_HOST });
});
qnapRouter.get("/retention", (_req, res) => {
    res.json(getRetentionPolicy());
});
qnapRouter.post("/purge/dry-run", (req, res) => {
    const days = Number(req.body?.retentionDays ?? req.body?.days ?? 90);
    const result = purgeArchives({ retentionDays: days, dryRun: true });
    res.json(result);
});
qnapRouter.post("/purge", (req, res) => {
    const days = Number(req.body?.retentionDays ?? req.body?.days ?? 90);
    const result = purgeArchives({ retentionDays: days, dryRun: false });
    logAudit({
        action: "qnap.purge",
        targetType: "archive",
        targetId: String(days),
        afterJson: result,
        ...auditContextFromRequest(req),
    });
    res.json(result);
});
qnapRouter.get("/report/:type", (req, res) => {
    const type = req.params.type;
    if (!["weekly", "monthly"].includes(type)) {
        res.status(400).json({ error: "type must be weekly|monthly" });
        return;
    }
    res.json({ ...generateCustomerReport(type), mock: !process.env.QNAP_HOST });
});
