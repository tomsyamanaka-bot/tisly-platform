import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { getPlatformSetting, setPlatformSetting } from "../db/database.js";

export type SiemSeverity = "info" | "warning" | "high" | "critical";

export interface SiemEvent {
  timestamp: string;
  tenant_id: string | null;
  site_id: string | null;
  user_id: string | null;
  action: string;
  severity: SiemSeverity;
  source_ip: string | null;
  device_id: string | null;
  event_id: string | null;
  message: string;
}

const SIEM_DIR = path.join(process.cwd(), "data", "siem");

function ensureSiemDir(): void {
  fs.mkdirSync(SIEM_DIR, { recursive: true });
}

export function exportSiemEvent(event: SiemEvent): void {
  if (!config.security.siemExportEnabled) return;
  ensureSiemDir();
  const line = JSON.stringify(event);
  const file = path.join(SIEM_DIR, `siem-${new Date().toISOString().slice(0, 10)}.ndjson`);
  fs.appendFileSync(file, line + "\n");
  const prev = getPlatformSetting<{ count: number }>("security:siem-export") ?? { count: 0 };
  setPlatformSetting("security:siem-export", {
    count: prev.count + 1,
    lastAt: event.timestamp,
    lastAction: event.action,
  });
}

export function getSiemExportStatus(): {
  enabled: boolean;
  exportCount: number;
  lastAt: string | null;
} {
  const meta = getPlatformSetting<{ count: number; lastAt?: string }>("security:siem-export");
  return {
    enabled: config.security.siemExportEnabled,
    exportCount: meta?.count ?? 0,
    lastAt: meta?.lastAt ?? null,
  };
}

/** Convenience wrapper for audit-style security events */
export function siemFromAudit(opts: {
  action: string;
  severity?: SiemSeverity;
  tenantId?: string;
  siteId?: string;
  userId?: string;
  sourceIp?: string;
  deviceId?: string;
  eventId?: string;
  message: string;
}): void {
  exportSiemEvent({
    timestamp: new Date().toISOString(),
    tenant_id: opts.tenantId ?? null,
    site_id: opts.siteId ?? null,
    user_id: opts.userId ?? null,
    action: opts.action,
    severity: opts.severity ?? "info",
    source_ip: opts.sourceIp ?? null,
    device_id: opts.deviceId ?? null,
    event_id: opts.eventId ?? null,
    message: opts.message,
  });
}
