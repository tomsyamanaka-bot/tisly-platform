import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import {
  normalizeUnifiedInput,
  unifiedToTislyEvent,
} from "../../event/unified-event.js";
import { getNotificationService } from "../../notification/notification-service.js";
import { broadcast } from "../../ws/hub.js";

export const eventsRouter = Router();

eventsRouter.get("/", (req, res) => {
  const db = getDatabase();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const deviceId = req.query.deviceId as string | undefined;
  const eventType = req.query.eventType as string | undefined;

  let sql = "SELECT * FROM events WHERE 1=1";
  const params: unknown[] = [];
  if (deviceId) {
    sql += " AND device_id = ?";
    params.push(deviceId);
  }
  if (eventType) {
    sql += " AND event_type = ?";
    params.push(eventType);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ events: rows });
});

eventsRouter.post("/ingest", async (req, res) => {
  if (!config.ingestSecret) {
    res.status(503).json({ error: "INGEST_SECRET not configured on server" });
    return;
  }
  const secret = req.header("x-tisly-ingest-secret");
  if (secret !== config.ingestSecret) {
    res.status(403).json({ error: "Invalid ingest secret" });
    return;
  }
  try {
    const unified = normalizeUnifiedInput(req.body, config.defaultTenantId);
    const event = unifiedToTislyEvent(unified);
    const service = getNotificationService();
    const id = await service.processEvent(event);
    const wsType =
      unified.severity === "alarm" || unified.severity === "critical"
        ? "alarm"
        : "event";
    broadcast({
      type: wsType,
      payload: { ...unified, id },
      at: unified.created_at,
    });
    res.status(201).json({ id, event_id: unified.event_id });
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "Invalid ingest payload",
    });
  }
});

eventsRouter.post("/", async (req, res) => {
  const { deviceId, eventType, title, body, payload, severity } = req.body;
  if (!deviceId || !eventType || !title) {
    res.status(400).json({ error: "deviceId, eventType, title required" });
    return;
  }
  const service = getNotificationService();
  const id = await service.processEvent({
    id: uuid(),
    deviceId,
    eventType,
    title,
    body,
    payload,
    severity,
  });
  res.status(201).json({ id });
});
