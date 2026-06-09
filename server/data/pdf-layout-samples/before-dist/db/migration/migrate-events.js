export function exportEventsForPostgres(sqlite, limit = 500_000) {
    return sqlite
        .prepare(`SELECT id, event_id, tenant_id, site_id, device_id, event_type, severity,
              title, message, zone, source_type, payload_json, created_at
       FROM events ORDER BY created_at DESC LIMIT ?`)
        .all(limit);
}
