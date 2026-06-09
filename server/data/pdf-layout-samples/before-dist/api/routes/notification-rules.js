import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { logAudit } from "../../provisioning/audit-log.js";
export const notificationRulesRouter = Router();
notificationRulesRouter.get("/", (req, res) => {
    const siteId = req.query.siteId;
    const db = getDatabase();
    let sql = "SELECT * FROM notification_rule_conditions WHERE 1=1";
    const params = [];
    if (siteId) {
        sql += " AND (site_id = ? OR site_id IS NULL)";
        params.push(siteId);
    }
    sql += " ORDER BY priority DESC, created_at DESC";
    const rows = db.prepare(sql).all(...params);
    res.json({
        rules: rows.map((r) => ({
            id: r.id,
            name: r.name,
            sensorType: r.sensor_type,
            timeWindow: r.time_window,
            severity: r.severity,
            channels: JSON.parse(r.channels_json),
            enabled: Boolean(r.enabled),
            siteId: r.site_id,
        })),
    });
});
notificationRulesRouter.post("/", (req, res) => {
    const { name, sensorType, timeWindow, severity, channels, siteId, enabled, priority } = req.body;
    if (!name) {
        res.status(400).json({ error: "name required" });
        return;
    }
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO notification_rule_conditions
       (id, name, sensor_type, time_window, severity, channels_json, site_id, enabled, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, name, sensorType ?? "window", timeWindow ?? "night", severity ?? "critical", JSON.stringify(channels ?? ["push", "discord"]), siteId ?? null, enabled !== false ? 1 : 0, priority ?? 0);
    logAudit({
        siteId,
        action: "notification_rule.create",
        entityType: "notification_rule",
        entityId: id,
        details: { name, sensorType, timeWindow, severity },
    });
    res.status(201).json({ ok: true, id });
});
notificationRulesRouter.patch("/:id", (req, res) => {
    const { enabled, name, sensorType, timeWindow, severity, channels } = req.body;
    const db = getDatabase();
    const existing = db
        .prepare("SELECT id FROM notification_rule_conditions WHERE id = ?")
        .get(req.params.id);
    if (!existing) {
        res.status(404).json({ error: "rule not found" });
        return;
    }
    db.prepare(`UPDATE notification_rule_conditions SET
       name = COALESCE(?, name),
       sensor_type = COALESCE(?, sensor_type),
       time_window = COALESCE(?, time_window),
       severity = COALESCE(?, severity),
       channels_json = COALESCE(?, channels_json),
       enabled = COALESCE(?, enabled),
       updated_at = datetime('now')
     WHERE id = ?`).run(name, sensorType, timeWindow, severity, channels ? JSON.stringify(channels) : null, enabled !== undefined ? (enabled ? 1 : 0) : null, req.params.id);
    logAudit({
        action: "notification_rule.update",
        entityType: "notification_rule",
        entityId: req.params.id,
        details: req.body,
    });
    res.json({ ok: true, id: req.params.id });
});
notificationRulesRouter.delete("/:id", (req, res) => {
    getDatabase()
        .prepare("DELETE FROM notification_rule_conditions WHERE id = ?")
        .run(req.params.id);
    logAudit({
        action: "notification_rule.delete",
        entityType: "notification_rule",
        entityId: req.params.id,
    });
    res.json({ ok: true });
});
