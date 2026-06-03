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

const SITE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "customer_id", ddl: "ALTER TABLE sites ADD COLUMN customer_id TEXT" },
  { name: "timezone", ddl: "ALTER TABLE sites ADD COLUMN timezone TEXT DEFAULT 'Asia/Tokyo'" },
];

const DEVICE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "customer_id", ddl: "ALTER TABLE devices ADD COLUMN customer_id TEXT" },
  { name: "site_id", ddl: "ALTER TABLE devices ADD COLUMN site_id TEXT" },
  { name: "serial_number", ddl: "ALTER TABLE devices ADD COLUMN serial_number TEXT" },
  { name: "firmware_version", ddl: "ALTER TABLE devices ADD COLUMN firmware_version TEXT" },
  { name: "last_seen", ddl: "ALTER TABLE devices ADD COLUMN last_seen TEXT" },
];

function addColumnsIfMissing(
  database: Database.Database,
  table: string,
  columns: Array<{ name: string; ddl: string }>
): void {
  const existing = new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  for (const col of columns) {
    if (!existing.has(col.name)) {
      database.exec(col.ddl);
    }
  }
}

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

  addColumnsIfMissing(database, "sites", SITE_COLUMNS);
  addColumnsIfMissing(database, "devices", DEVICE_COLUMNS);
  database.exec("CREATE INDEX IF NOT EXISTS idx_sites_customer ON sites(customer_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices(customer_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_devices_site ON devices(site_id)");

  migrateCustomerUsersPhase241(database);
  migratePhase261(database);
}

const CUSTOMER_INVITE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "invite_token", ddl: "ALTER TABLE customer_users ADD COLUMN invite_token TEXT" },
  { name: "invite_expires_at", ddl: "ALTER TABLE customer_users ADD COLUMN invite_expires_at TEXT" },
  { name: "invited_by", ddl: "ALTER TABLE customer_users ADD COLUMN invited_by TEXT" },
  { name: "invited_at", ddl: "ALTER TABLE customer_users ADD COLUMN invited_at TEXT" },
  { name: "accepted_at", ddl: "ALTER TABLE customer_users ADD COLUMN accepted_at TEXT" },
  { name: "disabled_at", ddl: "ALTER TABLE customer_users ADD COLUMN disabled_at TEXT" },
];

const INCIDENT_SOC_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "tenant_id", ddl: "ALTER TABLE incidents ADD COLUMN tenant_id TEXT" },
  { name: "customer_id", ddl: "ALTER TABLE incidents ADD COLUMN customer_id TEXT" },
  { name: "severity", ddl: "ALTER TABLE incidents ADD COLUMN severity TEXT DEFAULT 'info'" },
  { name: "title", ddl: "ALTER TABLE incidents ADD COLUMN title TEXT" },
];

function migratePhase261(database: Database.Database): void {
  addColumnsIfMissing(database, "customer_users", CUSTOMER_INVITE_COLUMNS);
  addColumnsIfMissing(database, "incidents", INCIDENT_SOC_COLUMNS);

  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_report_exports (
      export_id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      site_id TEXT,
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'generated',
      report_type TEXT NOT NULL,
      archive_path TEXT,
      html_snapshot TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_webhooks (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_customer_webhooks_customer ON customer_webhooks(customer_id)"
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_customer_report_exports_customer ON customer_report_exports(customer_id)"
  );
  migrateCustomerUsersInviteStatus(database);
}

function migrateCustomerUsersInviteStatus(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_users_invited_status") as { value_json: string } | undefined;
  if (marker) return;

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customer_users_phase261 (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'deleted')),
        last_login_at TEXT,
        failed_login_count INTEGER DEFAULT 0,
        locked_until TEXT,
        invite_token TEXT,
        invite_expires_at TEXT,
        invited_by TEXT,
        invited_at TEXT,
        accepted_at TEXT,
        disabled_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (customer_id, username),
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
      );
    `);
    const cols = new Set(
      (database.prepare("PRAGMA table_info(customer_users)").all() as Array<{ name: string }>).map(
        (r) => r.name
      )
    );
    const pick = (name: string, fallback: string) => (cols.has(name) ? name : fallback);
    database.exec(`
      INSERT OR REPLACE INTO customer_users_phase261
        (id, customer_id, username, password_hash, role, status,
         last_login_at, failed_login_count, locked_until,
         invite_token, invite_expires_at, invited_by, invited_at, accepted_at, disabled_at,
         created_at, updated_at)
      SELECT id, customer_id, username, password_hash, role, status,
        ${pick("last_login_at", "NULL")}, ${pick("failed_login_count", "0")}, ${pick("locked_until", "NULL")},
        ${pick("invite_token", "NULL")}, ${pick("invite_expires_at", "NULL")},
        ${pick("invited_by", "NULL")}, ${pick("invited_at", "NULL")},
        ${pick("accepted_at", "NULL")}, ${pick("disabled_at", "NULL")},
        created_at, updated_at
      FROM customer_users;
    `);
    database.exec("DROP TABLE customer_users");
    database.exec("ALTER TABLE customer_users_phase261 RENAME TO customer_users");
    database.exec(
      "CREATE INDEX IF NOT EXISTS idx_customer_users_customer ON customer_users(customer_id)"
    );
    database.prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    ).run("migration:customer_users_invited_status", JSON.stringify({ at: new Date().toISOString() }));
  } catch {
    /* already migrated */
  }
}

const CUSTOMER_USER_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "last_login_at", ddl: "ALTER TABLE customer_users ADD COLUMN last_login_at TEXT" },
  {
    name: "failed_login_count",
    ddl: "ALTER TABLE customer_users ADD COLUMN failed_login_count INTEGER DEFAULT 0",
  },
  { name: "locked_until", ddl: "ALTER TABLE customer_users ADD COLUMN locked_until TEXT" },
];

function migrateCustomerUsersPhase241(database: Database.Database): void {
  addColumnsIfMissing(database, "customer_users", CUSTOMER_USER_COLUMNS);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_users_owner_role") as { value_json: string } | undefined;
  if (marker) return;

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customer_users_phase241 (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'viewer', 'super_admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
        last_login_at TEXT,
        failed_login_count INTEGER DEFAULT 0,
        locked_until TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (customer_id, username),
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
      );
    `);
    const cols = new Set(
      (database.prepare("PRAGMA table_info(customer_users)").all() as Array<{ name: string }>).map(
        (r) => r.name
      )
    );
    const hasLock = cols.has("failed_login_count");
    database.exec(`
      INSERT OR REPLACE INTO customer_users_phase241
        (id, customer_id, username, password_hash, role, status, last_login_at, failed_login_count, locked_until, created_at, updated_at)
      SELECT id, customer_id, username, password_hash,
        CASE WHEN role = 'super_admin' THEN 'owner' ELSE role END,
        status,
        ${hasLock ? "last_login_at" : "NULL"},
        ${hasLock ? "COALESCE(failed_login_count, 0)" : "0"},
        ${hasLock ? "locked_until" : "NULL"},
        created_at, updated_at
      FROM customer_users;
    `);
    database.exec("DROP TABLE customer_users");
    database.exec("ALTER TABLE customer_users_phase241 RENAME TO customer_users");
    database.exec(
      "CREATE INDEX IF NOT EXISTS idx_customer_users_customer ON customer_users(customer_id)"
    );
    database.prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    ).run("migration:customer_users_owner_role", JSON.stringify({ at: new Date().toISOString() }));
  } catch {
    /* table may already support owner role */
  }
}
