import type Database from "better-sqlite3";

const EVENT_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "event_id", ddl: "ALTER TABLE events ADD COLUMN event_id TEXT" },
  { name: "tenant_id", ddl: "ALTER TABLE events ADD COLUMN tenant_id TEXT" },
  { name: "site_id", ddl: "ALTER TABLE events ADD COLUMN site_id TEXT" },
  { name: "source_type", ddl: "ALTER TABLE events ADD COLUMN source_type TEXT" },
  { name: "zone", ddl: "ALTER TABLE events ADD COLUMN zone TEXT" },
  { name: "message", ddl: "ALTER TABLE events ADD COLUMN message TEXT" },
];

const TV_DEVICE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "tenant_id", ddl: "ALTER TABLE tv_devices ADD COLUMN tenant_id TEXT" },
  { name: "display_name", ddl: "ALTER TABLE tv_devices ADD COLUMN display_name TEXT" },
  { name: "paired_at", ddl: "ALTER TABLE tv_devices ADD COLUMN paired_at TEXT" },
  { name: "status", ddl: "ALTER TABLE tv_devices ADD COLUMN status TEXT DEFAULT 'pending'" },
  { name: "revoked_at", ddl: "ALTER TABLE tv_devices ADD COLUMN revoked_at TEXT" },
  {
    name: "certificate_fingerprint",
    ddl: "ALTER TABLE tv_devices ADD COLUMN certificate_fingerprint TEXT",
  },
  {
    name: "device_certificate_placeholder",
    ddl: "ALTER TABLE tv_devices ADD COLUMN device_certificate_placeholder TEXT",
  },
];

const AUDIT_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "user_id", ddl: "ALTER TABLE audit_logs ADD COLUMN user_id TEXT" },
  { name: "target_type", ddl: "ALTER TABLE audit_logs ADD COLUMN target_type TEXT" },
  { name: "target_id", ddl: "ALTER TABLE audit_logs ADD COLUMN target_id TEXT" },
  { name: "before_json", ddl: "ALTER TABLE audit_logs ADD COLUMN before_json TEXT" },
  { name: "after_json", ddl: "ALTER TABLE audit_logs ADD COLUMN after_json TEXT" },
  { name: "ip_address", ddl: "ALTER TABLE audit_logs ADD COLUMN ip_address TEXT" },
  { name: "user_agent", ddl: "ALTER TABLE audit_logs ADD COLUMN user_agent TEXT" },
];

const DEVICE_CREDENTIAL_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "secret_encrypted", ddl: "ALTER TABLE device_credentials ADD COLUMN secret_encrypted TEXT" },
];

export function runMigrations(database: Database.Database): void {
  const existing = new Set(
    (database.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  for (const col of EVENT_COLUMNS) {
    if (!existing.has(col.name)) {
      database.exec(col.ddl);
    }
  }

  const tvCols = new Set(
    (database.prepare("PRAGMA table_info(tv_devices)").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  for (const col of TV_DEVICE_COLUMNS) {
    if (!tvCols.has(col.name)) {
      database.exec(col.ddl);
    }
  }

  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_tv_devices_site ON tv_devices(site_id)"
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_tv_devices_pairing ON tv_devices(pairing_code)"
  );

  const auditCols = new Set(
    (database.prepare("PRAGMA table_info(audit_logs)").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  for (const col of AUDIT_COLUMNS) {
    if (!auditCols.has(col.name)) {
      database.exec(col.ddl);
    }
  }

  const credCols = new Set(
    (database.prepare("PRAGMA table_info(device_credentials)").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  for (const col of DEVICE_CREDENTIAL_COLUMNS) {
    if (!credCols.has(col.name)) {
      database.exec(col.ddl);
    }
  }
}
