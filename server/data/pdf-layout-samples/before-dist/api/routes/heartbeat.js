import { Router } from "express";
import { getDatabase, getPlatformSetting } from "../../db/database.js";
import { recordHeartbeat } from "../../notification/heartbeat-monitor.js";
export const heartbeatRouter = Router();
heartbeatRouter.post("/", (req, res) => {
    const deviceId = req.body.deviceId ?? req.body.device_id;
    if (!deviceId) {
        res.status(400).json({ error: "deviceId required" });
        return;
    }
    recordHeartbeat(String(deviceId), req.body.platform);
    res.json({ ok: true });
});
heartbeatRouter.get("/status", (_req, res) => {
    const db = getDatabase();
    const settings = getPlatformSetting("heartbeat");
    const devices = db
        .prepare(`SELECT device_id, label, platform, last_heartbeat_at, heartbeat_status FROM devices ORDER BY device_id`)
        .all();
    res.json({
        thresholds: settings ?? { warnSec: 30, alarmSec: 300 },
        devices,
    });
});
