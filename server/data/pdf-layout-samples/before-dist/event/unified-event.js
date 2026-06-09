import { v4 as uuid } from "uuid";
export function normalizeUnifiedInput(body, defaultTenantId) {
    const eventId = body.event_id ??
        body.eventId ??
        uuid();
    const deviceId = body.device_id ??
        body.deviceId ??
        "unknown";
    const eventType = body.event_type ??
        body.eventType ??
        "event";
    const message = body.message ??
        body.title ??
        `TiSLY: ${eventType}`;
    const severity = body.severity ?? "info";
    const createdAt = body.created_at ??
        body.createdAt ??
        new Date().toISOString();
    return {
        event_id: eventId,
        tenant_id: body.tenant_id ?? body.tenantId ?? defaultTenantId,
        site_id: body.site_id ?? body.siteId ?? "default",
        device_id: deviceId,
        source_type: body.source_type ?? body.sourceType ?? "system",
        event_type: eventType,
        severity,
        zone: body.zone ?? "",
        message,
        payload: body.payload ?? {},
        created_at: createdAt,
    };
}
export function unifiedToTislyEvent(u) {
    return {
        id: u.event_id,
        deviceId: u.device_id,
        eventType: u.event_type,
        severity: u.severity,
        title: u.message,
        body: u.zone ? `zone: ${u.zone}` : undefined,
        payload: { ...u.payload, tenant_id: u.tenant_id, site_id: u.site_id, source_type: u.source_type },
        timestamp: u.created_at,
    };
}
