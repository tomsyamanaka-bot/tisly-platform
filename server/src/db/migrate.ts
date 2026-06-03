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
  { name: "zone_id", ddl: "ALTER TABLE devices ADD COLUMN zone_id TEXT" },
  { name: "floor_id", ddl: "ALTER TABLE devices ADD COLUMN floor_id TEXT" },
  { name: "pos_x", ddl: "ALTER TABLE devices ADD COLUMN pos_x REAL" },
  { name: "pos_y", ddl: "ALTER TABLE devices ADD COLUMN pos_y REAL" },
  { name: "icon_type", ddl: "ALTER TABLE devices ADD COLUMN icon_type TEXT" },
  { name: "rotation", ddl: "ALTER TABLE devices ADD COLUMN rotation REAL DEFAULT 0" },
  { name: "rssi", ddl: "ALTER TABLE devices ADD COLUMN rssi INTEGER" },
];

const DEVICE_COMMISSIONING_COLUMNS: Array<{ name: string; ddl: string }> = [
  {
    name: "commissioning_status",
    ddl: "ALTER TABLE devices ADD COLUMN commissioning_status TEXT DEFAULT 'draft'",
  },
  { name: "commissioned_at", ddl: "ALTER TABLE devices ADD COLUMN commissioned_at TEXT" },
  { name: "commissioned_by", ddl: "ALTER TABLE devices ADD COLUMN commissioned_by TEXT" },
  {
    name: "provisioning_token_hash",
    ddl: "ALTER TABLE devices ADD COLUMN provisioning_token_hash TEXT",
  },
  { name: "last_test_result", ddl: "ALTER TABLE devices ADD COLUMN last_test_result TEXT" },
  { name: "install_note", ddl: "ALTER TABLE devices ADD COLUMN install_note TEXT" },
];

const DEVICE_TRUST_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "cert_status", ddl: "ALTER TABLE devices ADD COLUMN cert_status TEXT DEFAULT 'none'" },
  { name: "cert_fingerprint", ddl: "ALTER TABLE devices ADD COLUMN cert_fingerprint TEXT" },
  { name: "trust_level", ddl: "ALTER TABLE devices ADD COLUMN trust_level TEXT DEFAULT 'none'" },
  { name: "last_cert_rotated_at", ddl: "ALTER TABLE devices ADD COLUMN last_cert_rotated_at TEXT" },
];

const ZONE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "floor_id", ddl: "ALTER TABLE zones ADD COLUMN floor_id TEXT" },
];

const TV_DEVICE_PHASE321: Array<{ name: string; ddl: string }> = [
  { name: "cert_status", ddl: "ALTER TABLE tv_devices ADD COLUMN cert_status TEXT DEFAULT 'unknown'" },
  { name: "serial", ddl: "ALTER TABLE tv_devices ADD COLUMN serial TEXT" },
];

const INCIDENT_LOCATION_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "floor_id", ddl: "ALTER TABLE incidents ADD COLUMN floor_id TEXT" },
  { name: "pos_x", ddl: "ALTER TABLE incidents ADD COLUMN pos_x REAL" },
  { name: "pos_y", ddl: "ALTER TABLE incidents ADD COLUMN pos_y REAL" },
  { name: "device_id", ddl: "ALTER TABLE incidents ADD COLUMN device_id TEXT" },
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
  migratePhase281(database);
  migratePhase301(database);
  migratePhase321(database);
}

function migratePhase321(database: Database.Database): void {
  addColumnsIfMissing(database, "devices", DEVICE_COLUMNS);
  addColumnsIfMissing(database, "zones", ZONE_COLUMNS);
  addColumnsIfMissing(database, "tv_devices", TV_DEVICE_PHASE321);
  addColumnsIfMissing(database, "incidents", INCIDENT_LOCATION_COLUMNS);
  database.exec("CREATE INDEX IF NOT EXISTS idx_devices_floor ON devices(floor_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_zones_floor ON zones(floor_id)");

  const customers = database
    .prepare(`SELECT customer_id FROM customers WHERE customer_code IN ('TOMS001', 'HOTEL001', 'PLANT001')`)
    .all() as Array<{ customer_id: string }>;
  for (const c of customers) {
    const exists = database
      .prepare(`SELECT 1 FROM customer_recovery_rules WHERE customer_id = ? LIMIT 1`)
      .get(c.customer_id);
    if (exists) continue;
    database
      .prepare(
        `INSERT INTO customer_recovery_rules (id, customer_id, name, condition_type, condition_device_type, action_type, action_target, enabled, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 10)`
      )
      .run(
        `seed-esp-offline-${c.customer_id}`,
        c.customer_id,
        "ESP Offline → Shelly reboot",
        "device_offline",
        "ESP",
        "shelly_reboot",
        "auto"
      );
  }
  migratePhase341(database);
}

function migratePhase341(database: Database.Database): void {
  addColumnsIfMissing(database, "devices", DEVICE_COMMISSIONING_COLUMNS);
  database.exec(`
    CREATE TABLE IF NOT EXISTS qr_provisioning_tokens (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_type TEXT NOT NULL,
      serial_number TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_qr_tokens_customer ON qr_provisioning_tokens(customer_id)"
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_qr_tokens_hash ON qr_provisioning_tokens(token_hash)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS install_photos (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      device_id TEXT,
      site_id TEXT,
      photo_path TEXT NOT NULL,
      photo_type TEXT NOT NULL DEFAULT 'install',
      uploaded_by TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_install_photos_customer ON install_photos(customer_id)"
  );
  migrateCustomerUsersInstallerRole(database);
  seedInstallerDemoUsers(database);
  migratePhase361(database);
}

function migratePhase361(database: Database.Database): void {
  addColumnsIfMissing(database, "devices", DEVICE_TRUST_COLUMNS);
  database.exec(`
    CREATE TABLE IF NOT EXISTS install_sessions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      site_id TEXT,
      installer_user_id TEXT,
      mode TEXT NOT NULL DEFAULT 'live',
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_install_sessions_customer ON install_sessions(customer_id)"
  );
  migratePhase421(database);
}

const DEVICE_PHASE421_COLUMNS: Array<{ name: string; ddl: string }> = [
  {
    name: "device_status",
    ddl: "ALTER TABLE devices ADD COLUMN device_status TEXT DEFAULT 'UNKNOWN'",
  },
  { name: "first_seen", ddl: "ALTER TABLE devices ADD COLUMN first_seen TEXT" },
];

function migratePhase421(database: Database.Database): void {
  addColumnsIfMissing(database, "devices", DEVICE_PHASE421_COLUMNS);
  database.exec(`
    CREATE TABLE IF NOT EXISTS device_timeline (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      device_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      actor TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_device_timeline_customer ON device_timeline(customer_id, created_at)"
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_device_timeline_device ON device_timeline(device_id, created_at)"
  );
  migrateCustomerUsersPwaRoles461(database);
  seedPwaRoleDemoUsers(database);
  migratePhase481(database);
  migratePhase501(database);
  migratePhase521(database);
  migratePhase541(database);
  migratePhase561(database);
  migratePhase601(database);
  migratePhase621(database);
}

function migratePhase621(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase621_toms_unified_workflow") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS business_project_timeline (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT DEFAULT '',
      actor TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_business_project_timeline_project
      ON business_project_timeline(project_id, created_at);

    CREATE TABLE IF NOT EXISTS toms_workflow_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      note TEXT DEFAULT '',
      actor TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_toms_workflow_history_project
      ON toms_workflow_history(project_id, created_at);

    CREATE TABLE IF NOT EXISTS toms_customer_master (
      id TEXT PRIMARY KEY,
      business_customer_id TEXT,
      name TEXT NOT NULL,
      company TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      sites_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_toms_customer_master_name ON toms_customer_master(name);

    CREATE TABLE IF NOT EXISTS toms_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      customer_id TEXT,
      asset_type TEXT NOT NULL,
      label TEXT NOT NULL,
      serial_number TEXT DEFAULT '',
      install_date TEXT,
      warranty_until TEXT,
      maintenance_until TEXT,
      qr_token TEXT UNIQUE,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_toms_assets_project ON toms_assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_toms_assets_qr ON toms_assets(qr_token);

    CREATE TABLE IF NOT EXISTS business_construction_photos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      file_path TEXT NOT NULL,
      auto_classified INTEGER NOT NULL DEFAULT 0,
      caption TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_business_construction_photos_project
      ON business_construction_photos(project_id, category);

    CREATE TABLE IF NOT EXISTS business_drawing_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version_kind TEXT NOT NULL CHECK (version_kind IN ('survey','construction','as_built')),
      version_no INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      file_path TEXT DEFAULT '',
      drawing_plan_id TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_business_drawing_versions_project
      ON business_drawing_versions(project_id, version_kind, version_no);

    CREATE TABLE IF NOT EXISTS toms_ai_estimate_v3 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      esp_count INTEGER DEFAULT 0,
      light_count INTEGER DEFAULT 0,
      camera_count INTEGER DEFAULT 0,
      lan_distance_m INTEGER DEFAULT 0,
      construction_days INTEGER DEFAULT 0,
      checklist_json TEXT DEFAULT '[]',
      candidate_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_toms_ai_estimate_v3_project ON toms_ai_estimate_v3(project_id, created_at);

    CREATE TABLE IF NOT EXISTS toms_push_alerts (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      alert_kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      href TEXT DEFAULT '',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_toms_push_alerts_kind ON toms_push_alerts(alert_kind, created_at);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase621_toms_unified_workflow",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

function migratePhase481(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase481_survey_maintenance_floor") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_projects (
      project_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      site_name TEXT NOT NULL,
      address TEXT,
      gps_lat REAL,
      gps_lng REAL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_survey_projects_customer ON survey_projects(customer_code)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_photos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      photo_type TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_survey_photos_project ON survey_photos(project_id)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_drawings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      pro_floor_id TEXT,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_checklists (
      project_id TEXT PRIMARY KEY,
      checklist_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_ai_estimates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS maintenance_cases (
      case_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      site_id TEXT,
      site_name TEXT,
      device_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_maintenance_cases_customer ON maintenance_cases(customer_code)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS pro_floor_layers (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('perimeter', '1f', '2f')),
      display_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      floor_id TEXT,
      image_path TEXT,
      image_kind TEXT DEFAULT 'png' CHECK (image_kind IN ('png', 'svg', 'jpg', 'jpeg')),
      survey_drawing_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
      FOREIGN KEY (floor_id) REFERENCES floors(id)
    );
  `);
  database.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_floor_layers_site_tier ON pro_floor_layers(site_id, tier)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS pro_map_pins (
      id TEXT PRIMARY KEY,
      layer_id TEXT NOT NULL,
      pin_type TEXT NOT NULL,
      label TEXT,
      pos_x REAL NOT NULL,
      pos_y REAL NOT NULL,
      device_id TEXT,
      status TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'WARNING', 'OFFLINE')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (layer_id) REFERENCES pro_floor_layers(id) ON DELETE CASCADE
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_pro_map_pins_layer ON pro_map_pins(layer_id)"
  );

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase481_survey_maintenance_floor", JSON.stringify({ at: new Date().toISOString() }));
}

function migratePhase521(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase521_toms_business_pwa") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS business_customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'individual',
      contact_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      pricing_tier_id TEXT,
      payment_terms TEXT DEFAULT '',
      invoice_closing_day INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_pricing_tiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      customer_id TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_projects (
      id TEXT PRIMARY KEY,
      project_no TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      title TEXT NOT NULL,
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      survey_schedule_json TEXT,
      survey_memo TEXT DEFAULT '',
      survey_photos_json TEXT DEFAULT '[]',
      estimate_id TEXT,
      construction_schedule_json TEXT,
      required_materials TEXT DEFAULT '',
      construction_memo TEXT DEFAULT '',
      construction_photos_json TEXT DEFAULT '[]',
      completion_report_id TEXT,
      invoice_id TEXT,
      payment_due_date TEXT,
      paid_date TEXT,
      qnap_base_path TEXT DEFAULT '',
      survey_project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_business_projects_status ON business_projects(status);
    CREATE TABLE IF NOT EXISTS business_estimates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      estimate_no TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      title TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      internal_cost INTEGER NOT NULL DEFAULT 0,
      gross_profit INTEGER NOT NULL DEFAULT 0,
      gross_profit_rate REAL NOT NULL DEFAULT 0,
      pdf_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS business_invoices (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      invoice_no TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      title TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      payment_due_date TEXT,
      bank_info TEXT DEFAULT '',
      pdf_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS business_completion_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      before_photos_json TEXT DEFAULT '[]',
      after_photos_json TEXT DEFAULT '[]',
      work_memo TEXT DEFAULT '',
      pdf_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS business_calendar_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      location TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_mail_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      mail_to TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      attachment_paths_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_qnap_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      base_path TEXT NOT NULL,
      folders_json TEXT NOT NULL,
      files_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS business_ai_candidates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'survey_ai',
      recommended_json TEXT NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase521_toms_business_pwa", JSON.stringify({ at: new Date().toISOString() }));
}

function migratePhase601(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase601_drawing_pwa") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS business_drawing_symbols (
      id TEXT PRIMARY KEY,
      trade_type TEXT NOT NULL,
      symbol_type TEXT NOT NULL,
      label TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#2563eb',
      default_estimate_item_id TEXT,
      memo TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_business_drawing_symbols_trade ON business_drawing_symbols(trade_type);

    CREATE TABLE IF NOT EXISTS business_drawing_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '施工図',
      source_type TEXT NOT NULL DEFAULT 'blank',
      background_image_path TEXT DEFAULT '',
      clean_image_path TEXT DEFAULT '',
      trade_type TEXT NOT NULL DEFAULT 'security_camera',
      symbols_json TEXT NOT NULL DEFAULT '[]',
      routes_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_business_drawing_plans_project ON business_drawing_plans(project_id, updated_at);

    CREATE TABLE IF NOT EXISTS business_specification_docs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      drawing_plan_id TEXT NOT NULL,
      title TEXT NOT NULL,
      overview TEXT DEFAULT '',
      included_trades_json TEXT DEFAULT '[]',
      material_summary TEXT DEFAULT '',
      work_summary TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      pdf_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_business_spec_docs_project ON business_specification_docs(project_id);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase601_drawing_pwa", JSON.stringify({ at: new Date().toISOString() }));
}

function migratePhase561(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase561_business_production") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS business_integration_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('calendar','gmail','qnap','pdf','status_flow')),
      provider TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
      request_json TEXT,
      response_json TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_business_integration_logs_project ON business_integration_logs(project_id, created_at);
    CREATE TABLE IF NOT EXISTS business_payments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      invoice_id TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL,
      method TEXT DEFAULT 'bank_transfer',
      memo TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_business_payments_project ON business_payments(project_id, payment_date);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase561_business_production", JSON.stringify({ at: new Date().toISOString() }));
}

function migratePhase541(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase541_business_workflow") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS business_pricing_rules (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('customer','contractor','work_item','standard')),
      scope_ref TEXT,
      work_category TEXT NOT NULL DEFAULT 'other',
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '式',
      unit_price INTEGER NOT NULL DEFAULT 0,
      cost_price INTEGER NOT NULL DEFAULT 0,
      tax_type TEXT NOT NULL DEFAULT 'standard',
      memo TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_business_pricing_rules_scope ON business_pricing_rules(scope_type, scope_ref);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase541_business_workflow", JSON.stringify({ at: new Date().toISOString() }));
}

function migratePhase501(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase501_survey_ai_sync") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_ai_intakes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      input_json TEXT,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_survey_ai_intakes_project ON survey_ai_intakes(project_id)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_drawing_ocr (
      id TEXT PRIMARY KEY,
      drawing_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (drawing_id) REFERENCES survey_drawings(id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_project_notes (
      project_id TEXT PRIMARY KEY,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_floor_map_links (
      project_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      linked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase501_survey_ai_sync", JSON.stringify({ at: new Date().toISOString() }));
}

function migrateCustomerUsersPwaRoles461(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_users_pwa_roles_461") as { value_json: string } | undefined;
  if (marker) return;
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customer_users_phase461 (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'viewer', 'installer', 'surveyor', 'maintenance', 'super_admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted', 'invited')),
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
    database.exec(`
      INSERT OR REPLACE INTO customer_users_phase461
        (id, customer_id, username, password_hash, role, status, last_login_at, failed_login_count, locked_until,
         invite_token, invite_expires_at, invited_by, invited_at, accepted_at, disabled_at, created_at, updated_at)
      SELECT id, customer_id, username, password_hash, role, status,
        ${cols.has("last_login_at") ? "last_login_at" : "NULL"},
        ${cols.has("failed_login_count") ? "COALESCE(failed_login_count, 0)" : "0"},
        ${cols.has("locked_until") ? "locked_until" : "NULL"},
        ${cols.has("invite_token") ? "invite_token" : "NULL"},
        ${cols.has("invite_expires_at") ? "invite_expires_at" : "NULL"},
        ${cols.has("invited_by") ? "invited_by" : "NULL"},
        ${cols.has("invited_at") ? "invited_at" : "NULL"},
        ${cols.has("accepted_at") ? "accepted_at" : "NULL"},
        ${cols.has("disabled_at") ? "disabled_at" : "NULL"},
        created_at, updated_at
      FROM customer_users;
    `);
    database.exec("DROP TABLE customer_users");
    database.exec("ALTER TABLE customer_users_phase461 RENAME TO customer_users");
    database.exec(
      "CREATE INDEX IF NOT EXISTS idx_customer_users_customer ON customer_users(customer_id)"
    );
    database.prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    ).run("migration:customer_users_pwa_roles_461", JSON.stringify({ at: new Date().toISOString() }));
  } catch {
    /* CHECK may already include surveyor/maintenance */
  }
}

function seedPwaRoleDemoUsers(database: Database.Database): void {
  const customers = database
    .prepare(`SELECT customer_id, customer_code FROM customers WHERE customer_code IN ('TOMS001', 'HOTEL001', 'PLANT001')`)
    .all() as Array<{ customer_id: string; customer_code: string }>;
  for (const c of customers) {
    const owner = database
      .prepare(`SELECT password_hash FROM customer_users WHERE customer_id = ? AND role = 'owner' LIMIT 1`)
      .get(c.customer_id) as { password_hash: string } | undefined;
    if (!owner) continue;
    for (const role of ["surveyor", "maintenance"] as const) {
      const userId = `cu-${c.customer_code}-${role}`;
      const username = `${c.customer_code.toLowerCase()}.${role}`;
      database
        .prepare(
          `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
           VALUES (?, ?, ?, ?, ?, 'active')
           ON CONFLICT(customer_id, username) DO NOTHING`
        )
        .run(userId, c.customer_id, username, owner.password_hash, role);
    }
  }
}

function seedInstallerDemoUsers(database: Database.Database): void {
  const customers = database
    .prepare(`SELECT customer_id, customer_code FROM customers WHERE customer_code IN ('TOMS001', 'HOTEL001', 'PLANT001')`)
    .all() as Array<{ customer_id: string; customer_code: string }>;
  for (const c of customers) {
    const owner = database
      .prepare(`SELECT password_hash FROM customer_users WHERE customer_id = ? AND role = 'owner' LIMIT 1`)
      .get(c.customer_id) as { password_hash: string } | undefined;
    if (!owner) continue;
    const userId = `cu-${c.customer_code}-installer`;
    const username = `${c.customer_code.toLowerCase()}.installer`;
    database
      .prepare(
        `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
         VALUES (?, ?, ?, ?, 'installer', 'active')
         ON CONFLICT(customer_id, username) DO NOTHING`
      )
      .run(userId, c.customer_id, username, owner.password_hash);
  }
}

function migrateCustomerUsersInstallerRole(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_users_installer_role") as { value_json: string } | undefined;
  if (marker) return;
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customer_users_phase341 (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'viewer', 'installer', 'super_admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted', 'invited')),
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
    const inviteCols = cols.has("invite_token")
      ? "invite_token, invite_expires_at, invited_by, invited_at, accepted_at, disabled_at"
      : "NULL, NULL, NULL, NULL, NULL, NULL";
    database.exec(`
      INSERT OR REPLACE INTO customer_users_phase341
        (id, customer_id, username, password_hash, role, status, last_login_at, failed_login_count, locked_until,
         invite_token, invite_expires_at, invited_by, invited_at, accepted_at, disabled_at, created_at, updated_at)
      SELECT id, customer_id, username, password_hash, role, status,
        ${cols.has("last_login_at") ? "last_login_at" : "NULL"},
        ${cols.has("failed_login_count") ? "COALESCE(failed_login_count, 0)" : "0"},
        ${cols.has("locked_until") ? "locked_until" : "NULL"},
        ${cols.has("invite_token") ? "invite_token" : "NULL"},
        ${cols.has("invite_expires_at") ? "invite_expires_at" : "NULL"},
        ${cols.has("invited_by") ? "invited_by" : "NULL"},
        ${cols.has("invited_at") ? "invited_at" : "NULL"},
        ${cols.has("accepted_at") ? "accepted_at" : "NULL"},
        ${cols.has("disabled_at") ? "disabled_at" : "NULL"},
        created_at, updated_at
      FROM customer_users;
    `);
    database.exec("DROP TABLE customer_users");
    database.exec("ALTER TABLE customer_users_phase341 RENAME TO customer_users");
    database.exec(
      "CREATE INDEX IF NOT EXISTS idx_customer_users_customer ON customer_users(customer_id)"
    );
    database.prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    ).run("migration:customer_users_installer_role", JSON.stringify({ at: new Date().toISOString() }));
  } catch {
    /* role CHECK may already include installer */
  }
}

function migratePhase301(database: Database.Database): void {
  const customerCols: Array<{ name: string; ddl: string }> = [
    { name: "stripe_customer_id", ddl: "ALTER TABLE customers ADD COLUMN stripe_customer_id TEXT" },
    { name: "stripe_subscription_id", ddl: "ALTER TABLE customers ADD COLUMN stripe_subscription_id TEXT" },
    { name: "subscription_status", ddl: "ALTER TABLE customers ADD COLUMN subscription_status TEXT DEFAULT 'none'" },
    { name: "next_billing_date", ddl: "ALTER TABLE customers ADD COLUMN next_billing_date TEXT" },
    { name: "last_invoice_status", ddl: "ALTER TABLE customers ADD COLUMN last_invoice_status TEXT" },
    {
      name: "contract_status",
      ddl: "ALTER TABLE customers ADD COLUMN contract_status TEXT DEFAULT 'active'",
    },
  ];
  addColumnsIfMissing(database, "customers", customerCols);

  const webhookCols: Array<{ name: string; ddl: string }> = [
    { name: "delivered_at", ddl: "ALTER TABLE webhook_delivery_logs ADD COLUMN delivered_at TEXT" },
  ];
  addColumnsIfMissing(database, "webhook_delivery_logs", webhookCols);

  database.exec(`
    CREATE TABLE IF NOT EXISTS report_email_queue (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      export_id TEXT,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      attachment_name TEXT,
      attachment_format TEXT DEFAULT 'html',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_report_email_queue_pending ON report_email_queue(status, next_retry_at)"
  );

  addColumnsIfMissing(database, "notification_queue", [
    { name: "last_error", ddl: "ALTER TABLE notification_queue ADD COLUMN last_error TEXT" },
  ]);
}

function migratePhase281(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_notification_rules (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      event_types_json TEXT NOT NULL DEFAULT '["*"]',
      severity TEXT NOT NULL DEFAULT '*',
      channels_json TEXT NOT NULL DEFAULT '["email"]',
      time_start TEXT,
      time_end TEXT,
      days_of_week_json TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_customer_notification_rules_customer ON customer_notification_rules(customer_id)"
  );
  database.exec(`
    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_retry_at TEXT,
      last_error TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (webhook_id) REFERENCES customer_webhooks(id)
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_webhook_delivery_pending ON webhook_delivery_logs(status, next_retry_at)"
  );
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
