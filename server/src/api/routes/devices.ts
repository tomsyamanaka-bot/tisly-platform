import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { recordHeartbeat } from "../../notification/heartbeat-monitor.js";

export const devicesRouter = Router();

devicesRouter.get("/", (_req, res) => {
  const db = getDatabase();
  const devices = db.prepare("SELECT * FROM devices ORDER BY updated_at DESC").all();
  res.json({ devices });
});

devicesRouter.post("/register", (req, res) => {
  const { deviceId, deviceType, platform, label, userId } = req.body;
  if (!deviceId) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  const db = getDatabase();
  const existing = db
    .prepare("SELECT id FROM devices WHERE device_id = ?")
    .get(deviceId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE devices SET device_type = COALESCE(?, device_type), platform = COALESCE(?, platform),
       label = COALESCE(?, label), user_id = COALESCE(?, user_id), updated_at = datetime('now')
       WHERE device_id = ?`
    ).run(deviceType, platform, label, userId, deviceId);
    res.json({ id: existing.id, deviceId, updated: true });
    return;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, platform, device_id, label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId ?? null, deviceType ?? "gateway", platform ?? "unknown", deviceId, label ?? deviceId);
  res.status(201).json({ id, deviceId });
});

devicesRouter.post("/:deviceId/heartbeat", (req, res) => {
  recordHeartbeat(req.params.deviceId, req.body?.platform);
  res.json({ ok: true, deviceId: req.params.deviceId });
});
