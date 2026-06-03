import { getDatabase } from "../db/database.js";
import { logAudit } from "../provisioning/audit-log.js";
import { getPlatformSetting, setPlatformSetting } from "../db/database.js";

export interface IdempotencyKey {
  tenantId: string;
  siteId: string;
  deviceId: string;
  eventId: string;
}

export function findExistingEvent(key: IdempotencyKey): { id: string } | null {
  const row = getDatabase()
    .prepare(
      `SELECT id FROM events
       WHERE tenant_id = ? AND site_id = ? AND device_id = ? AND event_id = ?
       LIMIT 1`
    )
    .get(key.tenantId, key.siteId, key.deviceId, key.eventId) as { id: string } | undefined;
  return row ?? null;
}

export function recordDuplicateIngest(key: IdempotencyKey, existingId: string): void {
  const prev =
    getPlatformSetting<{ count: number }>("security:ingest-duplicates") ?? { count: 0 };
  setPlatformSetting("security:ingest-duplicates", {
    count: prev.count + 1,
    lastAt: new Date().toISOString(),
    lastEventId: key.eventId,
  });
  logAudit({
    action: "ingest.duplicate",
    targetType: "event",
    targetId: key.eventId,
    tenantId: key.tenantId,
    siteId: key.siteId,
    details: { deviceId: key.deviceId, existingId },
  });
}

export function getIngestDuplicateCount(): number {
  const row = getPlatformSetting<{ count: number }>("security:ingest-duplicates");
  return row?.count ?? 0;
}
