import { Router } from "express";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { normalizeUnifiedInput, } from "../../event/unified-event.js";
import { requireIngestOrDeviceAuth } from "../../auth/device-auth.js";
import { createRateLimit } from "../../security/rate-limit-redis.js";
import { requireEventSignature } from "../../security/event-signature.js";
import { requireReplayProtection } from "../../security/replay-middleware.js";
import { ingestUnifiedEvent } from "../../security/ingest-handler.js";
export const eventsRouter = Router();
const ingestLimiter = createRateLimit({
    keyPrefix: "ingest",
    max: 120,
    windowMs: 60 * 1000,
});
eventsRouter.get("/", (req, res) => {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const deviceId = req.query.deviceId;
    const eventType = req.query.eventType;
    let sql = "SELECT * FROM events WHERE 1=1";
    const params = [];
    const ops = req
        .opsScope;
    if (ops?.customerId) {
        sql += " AND (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))";
        params.push(ops.tenantId ?? ops.customerId, ops.customerId);
    }
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
eventsRouter.post("/ingest", ingestLimiter, requireIngestOrDeviceAuth, requireEventSignature, requireReplayProtection, async (req, res) => {
    try {
        const unified = normalizeUnifiedInput(req.body, config.defaultTenantId);
        await ingestUnifiedEvent(unified, res, { sourceIp: req.ip });
    }
    catch (e) {
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
    const { getNotificationService } = await import("../../notification/notification-service.js");
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
