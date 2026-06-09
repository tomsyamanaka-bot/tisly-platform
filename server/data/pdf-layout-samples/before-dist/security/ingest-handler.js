import { unifiedToTislyEvent } from "../event/unified-event.js";
import { getNotificationService } from "../notification/notification-service.js";
import { broadcast } from "../ws/hub.js";
import { findExistingEvent, recordDuplicateIngest, } from "./event-idempotency.js";
import { siemFromAudit } from "./siem-exporter.js";
export async function ingestUnifiedEvent(unified, res, meta) {
    const key = {
        tenantId: unified.tenant_id,
        siteId: unified.site_id,
        deviceId: unified.device_id,
        eventId: unified.event_id,
    };
    const existing = findExistingEvent(key);
    if (existing) {
        recordDuplicateIngest(key, existing.id);
        siemFromAudit({
            action: "ingest.duplicate",
            severity: "info",
            tenantId: key.tenantId,
            siteId: key.siteId,
            deviceId: key.deviceId,
            eventId: key.eventId,
            sourceIp: meta?.sourceIp,
            message: `Duplicate event_id ${key.eventId}`,
        });
        res.status(200).json({
            ok: true,
            duplicate: true,
            id: existing.id,
            event_id: unified.event_id,
        });
        return;
    }
    const event = unifiedToTislyEvent(unified);
    const service = getNotificationService();
    const id = await service.processEvent(event);
    const wsType = unified.severity === "alarm" || unified.severity === "critical" ? "alarm" : "event";
    broadcast({
        type: wsType,
        payload: { ...unified, id },
        at: unified.created_at,
    });
    siemFromAudit({
        action: "ingest.accepted",
        severity: unified.severity === "alarm" ? "high" : "info",
        tenantId: unified.tenant_id,
        siteId: unified.site_id,
        deviceId: unified.device_id,
        eventId: unified.event_id,
        sourceIp: meta?.sourceIp,
        message: unified.message,
    });
    res.status(201).json({ ok: true, id, event_id: unified.event_id, duplicate: false });
}
