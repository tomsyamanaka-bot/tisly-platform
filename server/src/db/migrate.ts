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
  migratePhase1001(database);
  migratePhase1041(database);
  migratePhase1121(database);
  migratePhase1161(database);
  migratePhase1321(database);
  migratePhase1361(database);
  migratePhase1621(database);
  migratePhase2201(database);
  migrateFieldSurveyPwaV1(database);
  migrateSurveyPhotoSortOrder(database);
  migrateSurveyMaterialAntennaCategory(database);
  migrateFieldEstimatePwaV1(database);
  migrateSurveyCustomerSiteV2(database);
  migrateTomsEstimateStandardFormat(database);
  migrateSchedulePlannerV1(database);
  migratePracticalSearchIndex(database);
  migratePracticalPwaV2(database);
  migrateCompletionPhotosV1(database);
  migrateCustomerPriceRulesV1(database);
  migrateCustomerPriceRulesV1_1(database);
  migrateCustomerPriceRulesV1_2(database);
  migrateFieldOperationsSystemV1(database);
  migrateFieldOpsUiV2(database);
  migrateScheduleDayDeparturesV1(database);
  migrateArrivalWorkCompletionV1(database);
  migrateGoogleCalendarSyncV1(database);
  migrateGoogleCalendarMultiCalV1(database);
  migrateScheduleIntelligenceV1(database);
  migrateMaterialCheckV1(database);
  migrateEstimatePracticalV1(database);
  migrateScheduleDefaultOriginTsukubamiraiV1(database);
  migrateScheduleDefaultOriginTsukubamiraiV2(database);
  migrateScheduleEventAddressOverridesV1(database);
  migrateStorageSettingsV1(database);
  migrateProjectSoftDeleteV1(database);
  migrateProjectPdfQnapBackupV1(database);
  migrateSurveyIpEquipmentV1(database);
  migrateFieldChecklistV1(database);
  migrateProjectDocumentsV1(database);
  migrateProjectMgmtV1(database);
}

/** 案件一覧 v1 — 論理削除 deleted_at */
function migrateProjectSoftDeleteV1(database: Database.Database): void {
  addColumnsIfMissing(database, "business_projects", [
    {
      name: "deleted_at",
      ddl: "ALTER TABLE business_projects ADD COLUMN deleted_at TEXT",
    },
  ]);
  addColumnsIfMissing(database, "survey_projects", [
    {
      name: "deleted_at",
      ddl: "ALTER TABLE survey_projects ADD COLUMN deleted_at TEXT",
    },
  ]);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_soft_delete_v1") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_soft_delete_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 見積・請求 実務化 v1 — 明細テンプレ / 単独請求フラグ */
function migrateEstimatePracticalV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:estimate_practical_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS estimate_line_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_estimate_line_templates_active ON estimate_line_templates(active, sort_order);
  `);

  addColumnsIfMissing(database, "business_projects", [
    {
      name: "standalone_doc_kind",
      ddl: "ALTER TABLE business_projects ADD COLUMN standalone_doc_kind TEXT",
    },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:estimate_practical_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 材料チェック v1 — 案件ごとの材料リスト + 日付別チェック状態 */
function migrateMaterialCheckV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:material_check_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS field_check_item_day_states (
      item_id TEXT NOT NULL,
      check_date TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT,
      checked_by TEXT,
      PRIMARY KEY (item_id, check_date),
      FOREIGN KEY (item_id) REFERENCES field_check_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_field_check_day_states_date ON field_check_item_day_states(check_date);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:material_check_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 日程調整レベル4 — 移動時間キャッシュ */
function migrateScheduleIntelligenceV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_route_cache (
      cache_key TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      route_date TEXT NOT NULL,
      duration_min INTEGER,
      duration_source TEXT NOT NULL DEFAULT 'none',
      cached_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_route_cache_date ON schedule_route_cache(route_date);
  `);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:schedule_intelligence_v1") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:schedule_intelligence_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Google Calendar 複数カレンダー同期 — イベントにカレンダー色・ID を保持 */
function migrateGoogleCalendarMultiCalV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:google_calendar_multi_cal_v1") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "schedule_calendar_events", [
    { name: "calendar_id", ddl: "ALTER TABLE schedule_calendar_events ADD COLUMN calendar_id TEXT" },
    {
      name: "calendar_color",
      ddl: "ALTER TABLE schedule_calendar_events ADD COLUMN calendar_color TEXT",
    },
    {
      name: "calendar_summary",
      ddl: "ALTER TABLE schedule_calendar_events ADD COLUMN calendar_summary TEXT",
    },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:google_calendar_multi_cal_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Google Calendar 双方向同期 v1 — 設定・案件リンク */
function migrateGoogleCalendarSyncV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:google_calendar_sync_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS google_calendar_event_links (
      id TEXT PRIMARY KEY,
      google_event_id TEXT NOT NULL UNIQUE,
      google_calendar_id TEXT NOT NULL,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      schedule_event_id TEXT,
      link_kind TEXT NOT NULL DEFAULT 'linked' CHECK (link_kind IN ('linked', 'from_google', 'to_google')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gcal_links_project ON google_calendar_event_links(project_source, project_id);
    CREATE INDEX IF NOT EXISTS idx_gcal_links_event ON google_calendar_event_links(google_event_id);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:google_calendar_sync_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 到着・作業完了システム v1 — 作業セッション / 完了チェックリスト */
function migrateArrivalWorkCompletionV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:arrival_work_completion_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS project_work_sessions (
      id TEXT PRIMARY KEY,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      schedule_event_id TEXT,
      arrival_time TEXT,
      arrival_lat REAL,
      arrival_lng REAL,
      start_time TEXT,
      completion_time TEXT,
      worker_name TEXT,
      work_memo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_source, project_id, work_date)
    );
    CREATE INDEX IF NOT EXISTS idx_work_sessions_project ON project_work_sessions(project_source, project_id);
    CREATE INDEX IF NOT EXISTS idx_work_sessions_date ON project_work_sessions(work_date);

    CREATE TABLE IF NOT EXISTS completion_checklist_items (
      id TEXT PRIMARY KEY,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT,
      checked_by TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_completion_checklist_project ON completion_checklist_items(project_source, project_id);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:arrival_work_completion_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 出発リマインダー + 持ち物確認通知 v1 */
function migrateScheduleDayDeparturesV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:schedule_day_departures_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_day_departures (
      id TEXT PRIMARY KEY,
      departure_date TEXT NOT NULL UNIQUE,
      project_id TEXT,
      project_source TEXT,
      first_event_id TEXT,
      event_title TEXT,
      departure_time TEXT NOT NULL,
      reminder_minutes_before INTEGER NOT NULL DEFAULT 30,
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_sent_at TEXT,
      travel_duration_min INTEGER,
      travel_duration_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_day_departures_date ON schedule_day_departures(departure_date);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:schedule_day_departures_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Field Operations UI v2 — 工事種別・案件パイプライン拡張 */
function migrateFieldOpsUiV2(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:field_ops_ui_v2") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "survey_projects", [
    {
      name: "work_types_json",
      ddl: "ALTER TABLE survey_projects ADD COLUMN work_types_json TEXT NOT NULL DEFAULT '[]'",
    },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:field_ops_ui_v2", JSON.stringify({ at: new Date().toISOString() }));
}

/** Field Operations System v1 — 材料マスター / 工事テンプレ / 持ち物 / 発注 */
function migrateFieldOperationsSystemV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:field_operations_system_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      maker TEXT,
      model TEXT,
      unit TEXT NOT NULL DEFAULT '個',
      cost REAL NOT NULL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      memo TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
    CREATE INDEX IF NOT EXISTS idx_materials_active ON materials(active);

    CREATE TABLE IF NOT EXISTS work_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      material_id TEXT,
      label TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT,
      item_type TEXT NOT NULL DEFAULT 'material' CHECK (item_type IN ('material', 'tool')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES work_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id)
    );
    CREATE INDEX IF NOT EXISTS idx_work_template_items_template ON work_template_items(template_id);

    CREATE TABLE IF NOT EXISTS project_work_templates (
      id TEXT PRIMARY KEY,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_source, project_id, template_id),
      FOREIGN KEY (template_id) REFERENCES work_templates(id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_work_templates_project ON project_work_templates(project_source, project_id);

    CREATE TABLE IF NOT EXISTS field_check_items (
      id TEXT PRIMARY KEY,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      label TEXT NOT NULL,
      category TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      material_id TEXT,
      source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
      checked INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT,
      checked_by TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_field_check_items_project ON field_check_items(project_source, project_id);

    CREATE TABLE IF NOT EXISTS field_check_sessions (
      id TEXT PRIMARY KEY,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      checked_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      all_checked INTEGER NOT NULL DEFAULT 0,
      completed_by TEXT,
      completed_at TEXT NOT NULL,
      memo TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_field_check_sessions_project ON field_check_sessions(project_source, project_id);

    CREATE TABLE IF NOT EXISTS purchase_lines (
      id TEXT PRIMARY KEY,
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      material_id TEXT,
      label TEXT NOT NULL,
      qty_required REAL NOT NULL DEFAULT 0,
      qty_ordered REAL NOT NULL DEFAULT 0,
      unit TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received', 'carried')),
      supplier TEXT,
      ordered_at TEXT,
      received_at TEXT,
      carried_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_lines_project ON purchase_lines(project_source, project_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_lines_status ON purchase_lines(status);
  `);

  seedFieldOperationsSystemV1(database);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:field_operations_system_v1", JSON.stringify({ at: new Date().toISOString() }));
}

function seedFieldOperationsSystemV1(database: Database.Database): void {
  const count = database.prepare(`SELECT COUNT(*) as c FROM materials`).get() as { c: number };
  if (count.c > 0) return;

  const now = new Date().toISOString();
  const materials: Array<{
    id: string;
    category: string;
    name: string;
    maker: string;
    model: string;
    unit: string;
    cost: number;
    stock_qty: number;
    min_stock: number;
    supplier: string;
  }> = [
    { id: "mat-camera-outdoor", category: "防犯カメラ", name: "屋外防犯カメラ 200万画素", maker: "Hikvision", model: "DS-2CD2043G2", unit: "台", cost: 12000, stock_qty: 2, min_stock: 2, supplier: "防犯機器商事" },
    { id: "mat-nvr-8ch", category: "NVR", name: "8ch NVR", maker: "Hikvision", model: "DS-7608NI-K2", unit: "台", cost: 28000, stock_qty: 1, min_stock: 1, supplier: "防犯機器商事" },
    { id: "mat-hdd-4tb", category: "HDD", name: "監視用HDD 4TB", maker: "Seagate", model: "ST4000VX015", unit: "台", cost: 11000, stock_qty: 3, min_stock: 2, supplier: "PCパーツ卸" },
    { id: "mat-poe-8port", category: "電源", name: "PoEハブ 8port", maker: "Netgear", model: "GS108LP", unit: "台", cost: 15000, stock_qty: 1, min_stock: 1, supplier: "ネット機器卸" },
    { id: "mat-lan-cat6", category: "LAN", name: "CAT6 LANケーブル", maker: "エレコム", model: "LD-CT2", unit: "m", cost: 80, stock_qty: 150, min_stock: 100, supplier: "電材店" },
    { id: "mat-rj45", category: "LAN", name: "RJ45コネクタ", maker: "エレコム", model: "LD-RJ45", unit: "個", cost: 15, stock_qty: 50, min_stock: 30, supplier: "電材店" },
    { id: "mat-ladder", category: "工具", name: "脚立", maker: "ハセガワ", model: "LG-180", unit: "台", cost: 8000, stock_qty: 2, min_stock: 1, supplier: "工具レンタル" },
    { id: "mat-tester", category: "工具", name: "テスター", maker: "Hioki", model: "FT6031", unit: "台", cost: 5000, stock_qty: 3, min_stock: 2, supplier: "計測器店" },
    { id: "mat-crimp-tool", category: "工具", name: "圧着工具", maker: "エレコム", model: "LD-TMT", unit: "個", cost: 3500, stock_qty: 2, min_stock: 1, supplier: "電材店" },
    { id: "mat-driver-set", category: "工具", name: "ドライバーセット", maker: "VESSEL", model: "TD-56", unit: "式", cost: 2000, stock_qty: 5, min_stock: 2, supplier: "工具店" },
  ];

  const insertMat = database.prepare(
    `INSERT INTO materials (id, category, name, maker, model, unit, cost, stock_qty, min_stock, supplier, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  for (const m of materials) {
    insertMat.run(m.id, m.category, m.name, m.maker, m.model, m.unit, m.cost, m.stock_qty, m.min_stock, m.supplier, now, now);
  }

  const templateId = "wt-camera-4";
  database
    .prepare(
      `INSERT INTO work_templates (id, name, description, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?)`
    )
    .run(templateId, "防犯カメラ4台", "屋外カメラ4台・NVR・PoE・配線一式", now, now);

  const items: Array<{ id: string; material_id: string | null; label: string; qty: number; unit: string | null; item_type: string; sort_order: number }> = [
    { id: "wti-cam", material_id: "mat-camera-outdoor", label: "カメラ", qty: 4, unit: "台", item_type: "material", sort_order: 0 },
    { id: "wti-nvr", material_id: "mat-nvr-8ch", label: "NVR", qty: 1, unit: "台", item_type: "material", sort_order: 1 },
    { id: "wti-hdd", material_id: "mat-hdd-4tb", label: "HDD", qty: 1, unit: "台", item_type: "material", sort_order: 2 },
    { id: "wti-poe", material_id: "mat-poe-8port", label: "PoE", qty: 1, unit: "台", item_type: "material", sort_order: 3 },
    { id: "wti-lan", material_id: "mat-lan-cat6", label: "LAN", qty: 200, unit: "m", item_type: "material", sort_order: 4 },
    { id: "wti-rj45", material_id: "mat-rj45", label: "RJ45", qty: 20, unit: "個", item_type: "material", sort_order: 5 },
    { id: "wti-ladder", material_id: "mat-ladder", label: "脚立", qty: 1, unit: "台", item_type: "tool", sort_order: 6 },
    { id: "wti-tester", material_id: "mat-tester", label: "テスター", qty: 1, unit: "台", item_type: "tool", sort_order: 7 },
    { id: "wti-crimp", material_id: "mat-crimp-tool", label: "圧着工具", qty: 1, unit: "個", item_type: "tool", sort_order: 8 },
    { id: "wti-driver", material_id: "mat-driver-set", label: "ドライバー", qty: 1, unit: "式", item_type: "tool", sort_order: 9 },
  ];
  const insertItem = database.prepare(
    `INSERT INTO work_template_items (id, template_id, material_id, label, qty, unit, item_type, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const it of items) {
    insertItem.run(it.id, templateId, it.material_id, it.label, it.qty, it.unit, it.item_type, it.sort_order);
  }
}

/** 見積ごとの単価ルール適用フラグ（Customer Price Rule v1.2） */
function migrateCustomerPriceRulesV1_2(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_price_rules_v1_2") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "business_estimates", [
    {
      name: "apply_price_rule",
      ddl: "ALTER TABLE business_estimates ADD COLUMN apply_price_rule INTEGER NOT NULL DEFAULT 0",
    },
  ]);

  const now = new Date().toISOString();
  database
    .prepare(`INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)`)
    .run("migration:customer_price_rules_v1_2", JSON.stringify({ migratedAt: now }), now);
}

/** 見積ごとの単価ルール選択（Customer Price Rule v1.1） */
function migrateCustomerPriceRulesV1_1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_price_rules_v1_1") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "business_estimates", [
    {
      name: "price_rule_name",
      ddl: "ALTER TABLE business_estimates ADD COLUMN price_rule_name TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "price_rule_cost_multiplier",
      ddl: "ALTER TABLE business_estimates ADD COLUMN price_rule_cost_multiplier REAL",
    },
    {
      name: "price_rule_labor_multiplier",
      ddl: "ALTER TABLE business_estimates ADD COLUMN price_rule_labor_multiplier REAL",
    },
  ]);

  const now = new Date().toISOString();
  database
    .prepare(`INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)`)
    .run("migration:customer_price_rules_v1_1", JSON.stringify({ migratedAt: now }), now);
}

/** 顧客別単価ルール + 見積出精値引き */
function migrateCustomerPriceRulesV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_price_rules_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_price_rules (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      cost_multiplier REAL NOT NULL DEFAULT 2.0,
      labor_multiplier REAL NOT NULL DEFAULT 2.0,
      discount_policy_memo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES business_customers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_price_rules_customer
      ON customer_price_rules(customer_id);
  `);

  addColumnsIfMissing(database, "business_estimates", [
    {
      name: "shusei_discount_amount",
      ddl: "ALTER TABLE business_estimates ADD COLUMN shusei_discount_amount INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "shusei_discount_memo",
      ddl: "ALTER TABLE business_estimates ADD COLUMN shusei_discount_memo TEXT NOT NULL DEFAULT ''",
    },
  ]);

  const now = new Date().toISOString();
  database
    .prepare(`INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, ?)`)
    .run("migration:customer_price_rules_v1", JSON.stringify({ migratedAt: now }), now);
}

/** 見積PWA — 完了報告書用写真・現場不可詳細メモ */
function migrateCompletionPhotosV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS completion_photos (
      id TEXT PRIMARY KEY,
      business_project_id TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      title TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      uploaded_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_completion_photos_project ON completion_photos(business_project_id);
  `);
  addColumnsIfMissing(database, "schedule_unavailable_days", [
    {
      name: "detail_memo",
      ddl: "ALTER TABLE schedule_unavailable_days ADD COLUMN detail_memo TEXT NOT NULL DEFAULT ''",
    },
  ]);
  addColumnsIfMissing(database, "schedule_day_notes", [
    {
      name: "event_remark",
      ddl: "ALTER TABLE schedule_day_notes ADD COLUMN event_remark TEXT NOT NULL DEFAULT ''",
    },
  ]);
}

const BUSINESS_ESTIMATE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "header_json", ddl: "ALTER TABLE business_estimates ADD COLUMN header_json TEXT" },
  { name: "search_index_json", ddl: "ALTER TABLE business_estimates ADD COLUMN search_index_json TEXT" },
];

/** 日程調整 PWA v1 — 現場不可日 */
function migrateSchedulePlannerV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_unavailable_days (
      id TEXT PRIMARY KEY,
      unavailable_date TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_unavailable_date ON schedule_unavailable_days(unavailable_date);
    CREATE TABLE IF NOT EXISTS schedule_day_notes (
      note_date TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_day_notes_date ON schedule_day_notes(note_date);
  `);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:schedule_planner_v1") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:schedule_planner_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 実務PWA v2 — カレンダーキャッシュ・案件チェーン */
function migratePracticalPwaV2(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_calendar_events (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      event_date TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'google',
      start_time TEXT,
      end_time TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT,
      description TEXT,
      synced_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_cal_date ON schedule_calendar_events(event_date);
    CREATE TABLE IF NOT EXISTS project_case_chain (
      id TEXT PRIMARY KEY,
      case_no TEXT NOT NULL UNIQUE,
      survey_project_id TEXT,
      business_project_id TEXT,
      customer_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_project_case_survey ON project_case_chain(survey_project_id);
    CREATE INDEX IF NOT EXISTS idx_project_case_business ON project_case_chain(business_project_id);
  `);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:practical_pwa_v2") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:practical_pwa_v2", JSON.stringify({ at: new Date().toISOString() }));
}

/** 見積・請求検索用メタデータ */
function migratePracticalSearchIndex(database: Database.Database): void {
  addColumnsIfMissing(database, "business_estimates", BUSINESS_ESTIMATE_COLUMNS.filter((c) => c.name === "search_index_json"));
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:practical_search_index_v1") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:practical_search_index_v1", JSON.stringify({ at: new Date().toISOString() }));
}

const BUSINESS_INVOICE_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "estimate_ref_no", ddl: "ALTER TABLE business_invoices ADD COLUMN estimate_ref_no TEXT" },
];

function migrateTomsEstimateStandardFormat(database: Database.Database): void {
  addColumnsIfMissing(database, "business_estimates", BUSINESS_ESTIMATE_COLUMNS);
  addColumnsIfMissing(database, "business_invoices", BUSINESS_INVOICE_COLUMNS);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:toms_estimate_standard_format_v1") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:toms_estimate_standard_format_v1",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 現調PWA — 写真並び順 */
function migrateSurveyPhotoSortOrder(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:survey_photo_sort_order") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "survey_photos", [
    { name: "sort_order", ddl: "ALTER TABLE survey_photos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0" },
  ]);

  const projects = database
    .prepare(`SELECT DISTINCT project_id FROM survey_photos`)
    .all() as Array<{ project_id: string }>;
  const listStmt = database.prepare(
    `SELECT id FROM survey_photos WHERE project_id = ? ORDER BY created_at ASC, id ASC`
  );
  const updateStmt = database.prepare(`UPDATE survey_photos SET sort_order = ? WHERE id = ?`);
  for (const { project_id } of projects) {
    const rows = listStmt.all(project_id) as Array<{ id: string }>;
    rows.forEach((row, index) => updateStmt.run(index, row.id));
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:survey_photo_sort_order", JSON.stringify({ at: new Date().toISOString() }));
}

/** 現調PWA — 依頼主住所（顧客と現場の分離） */
function migrateSurveyCustomerSiteV2(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:survey_customer_site_v2") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "survey_projects", [
    { name: "customer_address", ddl: "ALTER TABLE survey_projects ADD COLUMN customer_address TEXT" },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:survey_customer_site_v2", JSON.stringify({ at: new Date().toISOString() }));
}

const SURVEY_PROJECT_V1_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "project_no", ddl: "ALTER TABLE survey_projects ADD COLUMN project_no TEXT" },
  { name: "customer_name", ddl: "ALTER TABLE survey_projects ADD COLUMN customer_name TEXT" },
  { name: "phone", ddl: "ALTER TABLE survey_projects ADD COLUMN phone TEXT" },
  { name: "email", ddl: "ALTER TABLE survey_projects ADD COLUMN email TEXT" },
  { name: "survey_date", ddl: "ALTER TABLE survey_projects ADD COLUMN survey_date TEXT" },
  { name: "assignee", ddl: "ALTER TABLE survey_projects ADD COLUMN assignee TEXT" },
  {
    name: "workflow_status",
    ddl: "ALTER TABLE survey_projects ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'surveying'",
  },
];

const SURVEY_PHOTO_V1_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "comment", ddl: "ALTER TABLE survey_photos ADD COLUMN comment TEXT" },
  { name: "taken_at", ddl: "ALTER TABLE survey_photos ADD COLUMN taken_at TEXT" },
];

/** TiSLY 現調PWA v1 — 案件拡張・部材・見積引き渡しログ */
function migrateFieldSurveyPwaV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:field_survey_pwa_v1") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "survey_projects", SURVEY_PROJECT_V1_COLUMNS);
  addColumnsIfMissing(database, "survey_photos", SURVEY_PHOTO_V1_COLUMNS);

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_projects_project_no
      ON survey_projects(project_no) WHERE project_no IS NOT NULL;
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_survey_projects_workflow
      ON survey_projects(workflow_status);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_materials (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (
        'camera', 'wifi', 'intercom', 'electrical',
        'lighting', 'lan', 'antenna', 'other'
      )),
      item_label TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      memo TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_survey_materials_project ON survey_materials(project_id)"
  );

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_handoff_log (
      id TEXT PRIMARY KEY,
      survey_project_id TEXT NOT NULL UNIQUE,
      business_project_id TEXT NOT NULL,
      handoff_by TEXT,
      handoff_at TEXT DEFAULT (datetime('now')),
      payload_json TEXT DEFAULT '{}',
      FOREIGN KEY (survey_project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:field_survey_pwa_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 部材カテゴリに antenna を追加（aircon を廃止） */
function migrateSurveyMaterialAntennaCategory(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:survey_material_antenna") as { value_json: string } | undefined;
  if (marker) return;

  const tableRow = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='survey_materials'")
    .get() as { name: string } | undefined;
  if (!tableRow) {
    database
      .prepare(
        `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
      )
      .run("migration:survey_material_antenna", JSON.stringify({ skipped: "no_table" }));
    return;
  }

  try {
    database.exec(`
      CREATE TABLE survey_materials_antenna (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN (
          'camera', 'wifi', 'intercom', 'electrical',
          'lighting', 'lan', 'antenna', 'other'
        )),
        item_label TEXT DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 1,
        memo TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
      );
    `);
    database.exec(`
      INSERT INTO survey_materials_antenna
        (id, project_id, category, item_label, quantity, memo, sort_order, created_at, updated_at)
      SELECT
        id, project_id,
        CASE
          WHEN category = 'aircon' THEN 'antenna'
          WHEN category IN ('camera','wifi','intercom','electrical','lighting','lan','antenna','other') THEN category
          ELSE 'other'
        END,
        item_label, quantity, memo, sort_order, created_at, updated_at
      FROM survey_materials;
    `);
    database.exec("DROP TABLE survey_materials");
    database.exec("ALTER TABLE survey_materials_antenna RENAME TO survey_materials");
    database.exec(
      "CREATE INDEX IF NOT EXISTS idx_survey_materials_project ON survey_materials(project_id)"
    );
  } catch {
    /* 新規 DB または既に antenna 対応済み */
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:survey_material_antenna", JSON.stringify({ at: new Date().toISOString() }));
}

/** TiSLY 見積PWA v1 — インデックス追加（既存 business テーブル利用） */
function migrateFieldEstimatePwaV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:field_estimate_pwa_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_business_projects_survey_project
      ON business_projects(survey_project_id) WHERE survey_project_id IS NOT NULL;
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:field_estimate_pwa_v1", JSON.stringify({ at: new Date().toISOString() }));
}

function migratePhase2201(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase2201_real_data") as { value_json: string } | undefined;
  if (marker) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS maintenance_inspection_notes (
      customer_code TEXT PRIMARY KEY,
      memo TEXT NOT NULL DEFAULT '',
      updated_at TEXT,
      updated_by TEXT
    );
  `);
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase2201_real_data", JSON.stringify({ at: new Date().toISOString() }));
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
  migratePhase661(database);
  migratePhase701(database);
  migratePhase741(database);
  migratePhase781(database);
}

function migratePhase781(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase781_production_reliability") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS gmail_send_dlq (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      queue_id TEXT,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'dead_letter',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gmail_send_dlq_created
      ON gmail_send_dlq(created_at DESC);

    CREATE TABLE IF NOT EXISTS qnap_upload_manifest (
      project_id TEXT NOT NULL,
      remote_path TEXT NOT NULL,
      local_path TEXT NOT NULL,
      checksum TEXT NOT NULL,
      size INTEGER NOT NULL,
      modified_at TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, remote_path),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pro_operations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      action TEXT NOT NULL,
      tier TEXT,
      pin_id TEXT,
      notification_id TEXT,
      actor TEXT DEFAULT 'remote',
      payload_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pro_operations_project
      ON pro_operations(project_id, created_at DESC);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase781_production_reliability",
      JSON.stringify({ at: new Date().toISOString() })
    );

  migratePhase1001(database);
  migratePhase1041(database);
  migratePhase1121(database);
  migratePhase1161(database);
  migratePhase1321(database);
  migratePhase1361(database);
}

function migratePhase1121(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1121_field_deployment_rc1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_audio_memos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      mime_type TEXT,
      duration_sec REAL,
      transcript TEXT,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_survey_audio_project ON survey_audio_memos(project_id);

    CREATE TABLE IF NOT EXISTS survey_sketch_memos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      image_path TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_survey_sketch_project ON survey_sketch_memos(project_id);

    CREATE TABLE IF NOT EXISTS survey_analysis_v4 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_survey_analysis_v4_project ON survey_analysis_v4(project_id);

    CREATE TABLE IF NOT EXISTS asset_qr_tokens (
      asset_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      site_id TEXT,
      device_id TEXT NOT NULL UNIQUE,
      device_kind TEXT NOT NULL,
      label TEXT NOT NULL,
      qr_token TEXT NOT NULL,
      reissued_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_asset_qr_customer ON asset_qr_tokens(customer_code);
    CREATE INDEX IF NOT EXISTS idx_asset_qr_token ON asset_qr_tokens(qr_token);

    CREATE TABLE IF NOT EXISTS asset_qr_history (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      qr_token TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'reissue')),
      device_kind TEXT NOT NULL,
      device_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      actor TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_asset_qr_history_asset ON asset_qr_history(asset_id, created_at);

    CREATE TABLE IF NOT EXISTS maintenance_schedules (
      schedule_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      site_id TEXT,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_maint_schedules_customer ON maintenance_schedules(customer_code, due_date);

    CREATE TABLE IF NOT EXISTS maintenance_reports (
      report_id TEXT PRIMARY KEY,
      schedule_id TEXT,
      case_id TEXT,
      customer_code TEXT NOT NULL,
      comment TEXT,
      photo_paths_json TEXT NOT NULL DEFAULT '[]',
      completed_at TEXT NOT NULL,
      reported_by TEXT,
      FOREIGN KEY (schedule_id) REFERENCES maintenance_schedules(schedule_id)
    );
    CREATE INDEX IF NOT EXISTS idx_maint_reports_customer ON maintenance_reports(customer_code, completed_at);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase1121_field_deployment_rc1",
      JSON.stringify({ at: new Date().toISOString(), phase: "1121-1160" })
    );
}

function migratePhase1321(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1321_security_automation") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS security_state (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'disarmed' CHECK (mode IN ('armed', 'disarmed', 'pending_arm', 'pending_disarm')),
      reason TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('manual', 'switchbot', 'presence', 'system')),
      last_changed_at TEXT NOT NULL,
      last_changed_by TEXT NOT NULL DEFAULT 'system'
    );
    CREATE INDEX IF NOT EXISTS idx_security_state_changed ON security_state(last_changed_at);

    CREATE TABLE IF NOT EXISTS registered_presence_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('iphone', 'android', 'tablet', 'pc', 'other')),
      owner_name TEXT NOT NULL DEFAULT '',
      mac_address TEXT,
      ip_address TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT,
      presence_status TEXT NOT NULL DEFAULT 'unknown' CHECK (presence_status IN ('home', 'away', 'unknown')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_presence_devices_status ON registered_presence_devices(presence_status);

    CREATE TABLE IF NOT EXISTS security_automation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('switchbot_locked', 'switchbot_unlocked')),
      required_presence TEXT NOT NULL DEFAULT 'all_away' CHECK (required_presence IN ('all_away', 'ignore')),
      action TEXT NOT NULL CHECK (action IN ('arm', 'disarm', 'create_candidate')),
      delay_seconds INTEGER NOT NULL DEFAULT 300,
      unknown_device_policy TEXT NOT NULL DEFAULT 'block_auto_arm'
        CHECK (unknown_device_policy IN ('block_auto_arm', 'unknown_as_away', 'unknown_as_home')),
      require_confirmation INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS security_event_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      message TEXT NOT NULL,
      before_mode TEXT,
      after_mode TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_security_event_logs_created ON security_event_logs(created_at);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase1321_security_automation",
      JSON.stringify({ at: new Date().toISOString(), phase: "1321-1340" })
    );
}

function migratePhase1361(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1361_lock_provider") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS lock_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('adult', 'child', 'guest')),
      enabled INTEGER NOT NULL DEFAULT 1,
      notification_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lock_users_role ON lock_users(role);

    CREATE TABLE IF NOT EXISTS lock_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('switchbot', 'sesame', 'mock')),
      device_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'lock', 'unlock', 'face_unlock', 'fingerprint_unlock', 'nfc_unlock', 'manual_unlock', 'unknown'
      )),
      user_id TEXT,
      user_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lock_events_created ON lock_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_lock_events_type ON lock_events(event_type);

    CREATE TABLE IF NOT EXISTS presence_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      device_ids TEXT NOT NULL DEFAULT '[]',
      role TEXT NOT NULL CHECK (role IN ('adult', 'child', 'guest')),
      notification_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS family_notifications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN (
        'child_arrived_home', 'child_left_home', 'guest_unlock', 'unknown_unlock'
      )),
      user_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      method TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_family_notifications_created ON family_notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_family_notifications_kind ON family_notifications(kind);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase1361_lock_provider",
      JSON.stringify({ at: new Date().toISOString(), phase: "1361-1380" })
    );
}

function migratePhase1621(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1621_field_operations") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS maintenance_replacement_parts (
      part_id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      part_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '個',
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES maintenance_reports(report_id)
    );
    CREATE INDEX IF NOT EXISTS idx_maint_parts_report ON maintenance_replacement_parts(report_id);
    CREATE INDEX IF NOT EXISTS idx_maint_parts_customer ON maintenance_replacement_parts(customer_code);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase1621_field_operations",
      JSON.stringify({ at: new Date().toISOString(), phase: "1621-1680" })
    );
}

function migratePhase1161(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1161_field_deployment_rc2") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS field_projects (
      id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      building_type TEXT NOT NULL DEFAULT 'other',
      plan_candidates_json TEXT NOT NULL DEFAULT '[]',
      survey_staff TEXT NOT NULL DEFAULT '',
      scheduled_date TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      survey_project_id TEXT NOT NULL,
      business_project_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_field_projects_survey ON field_projects(survey_project_id);
    CREATE INDEX IF NOT EXISTS idx_field_projects_business ON field_projects(business_project_id);

    CREATE TABLE IF NOT EXISTS survey_analysis_v2 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_survey_analysis_v2_project ON survey_analysis_v2(project_id);

    CREATE TABLE IF NOT EXISTS business_estimate_drafts_v2 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT 'v2',
      lines_json TEXT NOT NULL DEFAULT '[]',
      subtotal REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      gross_profit REAL NOT NULL DEFAULT 0,
      gross_profit_rate REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_estimate_drafts_v2_project ON business_estimate_drafts_v2(project_id);

    CREATE TABLE IF NOT EXISTS deployment_checklist_rc2 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      completed_by TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deployment_checklist_rc2_project ON deployment_checklist_rc2(project_id);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase1161_field_deployment_rc2",
      JSON.stringify({ at: new Date().toISOString(), phase: "1161-1200" })
    );
}

function migratePhase1041(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1041_installer_field_checklist") as { value_json: string } | undefined;
  if (marker) return;

  const cols = database.prepare(`PRAGMA table_info(deployment_checklist)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "installer_items_json")) {
    database.exec(
      `ALTER TABLE deployment_checklist ADD COLUMN installer_items_json TEXT NOT NULL DEFAULT '{}'`
    );
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase1041_installer_field_checklist",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

function migratePhase1001(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase1001_deployment_kit") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS deployment_customer_contacts (
      customer_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      site_name TEXT NOT NULL,
      address TEXT,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );

    CREATE TABLE IF NOT EXISTS deployment_assets (
      asset_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      site_id TEXT NOT NULL,
      device_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      location TEXT,
      kind TEXT,
      scan_count INTEGER NOT NULL DEFAULT 0,
      last_scan_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_deployment_assets_customer ON deployment_assets(customer_code);
    CREATE INDEX IF NOT EXISTS idx_deployment_assets_device ON deployment_assets(device_id);

    CREATE TABLE IF NOT EXISTS deployment_checklist (
      customer_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '{}',
      deployment_complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployment_install_records (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      site_id TEXT,
      device_id TEXT,
      step TEXT NOT NULL,
      photo_path TEXT,
      signature_data TEXT,
      gps_lat REAL,
      gps_lng REAL,
      notes TEXT,
      installer_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_deployment_install_customer ON deployment_install_records(customer_code);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:phase1001_deployment_kit", JSON.stringify({ at: new Date().toISOString() }));
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

function migratePhase661(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase661_command_center") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS toms_project_notifications (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
      href TEXT DEFAULT '',
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_toms_project_notifications_project
      ON toms_project_notifications(project_id, acknowledged, created_at);

    CREATE TABLE IF NOT EXISTS toms_project_maintenance (
      case_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      target_devices_json TEXT NOT NULL DEFAULT '[]',
      photos_json TEXT NOT NULL DEFAULT '[]',
      assignee TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_toms_project_maintenance_project
      ON toms_project_maintenance(project_id, status);
  `);

  try {
    database.exec(
      `ALTER TABLE business_drawing_versions ADD COLUMN devices_json TEXT NOT NULL DEFAULT '[]'`
    );
  } catch {
    /* column may exist */
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase661_command_center",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

function migratePhase741(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase741_real_connection") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS gmail_send_queue (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_preview TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','retrying','sent','failed')),
      send_mode TEXT NOT NULL DEFAULT 'mockOnly',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gmail_send_queue_status
      ON gmail_send_queue(status, updated_at);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase741_real_connection",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

function migratePhase701(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:phase701_live_operations") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS business_integration_retry_queue (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      channel TEXT NOT NULL CHECK (channel IN ('gmail','qnap','pdf')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','retrying','success','failed','cancelled')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      send_mode TEXT NOT NULL DEFAULT 'mockOnly',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      log_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_integration_retry_status
      ON business_integration_retry_queue(status, updated_at);

    CREATE TABLE IF NOT EXISTS ai_estimate_feedback (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      estimate_v3_id TEXT,
      action TEXT NOT NULL CHECK (action IN ('adopted','revised','rejected')),
      notes TEXT DEFAULT '',
      candidate_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_estimate_feedback_project
      ON ai_estimate_feedback(project_id, created_at);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:phase701_live_operations",
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
    -- 案件 PDF メタ（将来 QNAP 連携）— 現状は pdf_path のみ使用。
    -- 次フェーズで project_pdf_meta テーブル追加、または pdf_path 行へ以下を拡張予定:
    --   storage_provider, local_path, qnap_path,
    --   qnap_backup_status (pending|synced|failed), qnap_backuped_at, qnap_last_error
    -- 設計: docs/qnap-pdf-backup-plan.md
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

/** 通常出発地 — つくばみらい市板橋2889-2 を初期値として設定 */
function migrateScheduleDefaultOriginTsukubamiraiV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:schedule_default_origin_tsukubamirai_v1") as { value_json: string } | undefined;
  if (marker) return;

  const SETTINGS_KEY = "schedule_planner_settings_v1";
  const DEFAULT_ORIGIN = "茨城県つくばみらい市板橋2889-2";
  const row = database
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value_json: string } | undefined;

  let currentOrigin = "";
  if (row) {
    try {
      const parsed = JSON.parse(row.value_json) as { defaultOrigin?: string };
      currentOrigin = String(parsed.defaultOrigin ?? "").trim();
    } catch {
      /* ignore */
    }
  }

  if (!currentOrigin) {
    const next = {
      defaultOrigin: DEFAULT_ORIGIN,
      updatedAt: new Date().toISOString(),
    };
    database
      .prepare(
        `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(SETTINGS_KEY, JSON.stringify(next));
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:schedule_default_origin_tsukubamirai_v1",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 通常出発地 — プレースホルダ（自宅等）をつくばみらい市板橋2889-2 へ更新 */
function migrateScheduleDefaultOriginTsukubamiraiV2(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:schedule_default_origin_tsukubamirai_v2") as { value_json: string } | undefined;
  if (marker) return;

  const SETTINGS_KEY = "schedule_planner_settings_v1";
  const DEFAULT_ORIGIN = "茨城県つくばみらい市板橋2889-2";
  const PLACEHOLDER_ORIGINS = new Set(["", "自宅", "事務所（守谷市）"]);

  const row = database
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value_json: string } | undefined;

  let currentOrigin = "";
  if (row) {
    try {
      const parsed = JSON.parse(row.value_json) as { defaultOrigin?: string };
      currentOrigin = String(parsed.defaultOrigin ?? "").trim();
    } catch {
      /* ignore */
    }
  }

  if (!PLACEHOLDER_ORIGINS.has(currentOrigin)) {
    database
      .prepare(
        `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
      )
      .run(
        "migration:schedule_default_origin_tsukubamirai_v2",
        JSON.stringify({ at: new Date().toISOString(), skipped: true, currentOrigin })
      );
    return;
  }

  const next = {
    defaultOrigin: DEFAULT_ORIGIN,
    updatedAt: new Date().toISOString(),
  };
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .run(SETTINGS_KEY, JSON.stringify(next));

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:schedule_default_origin_tsukubamirai_v2",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 予定住所補正 — Google カレンダー location が空でも TiSLY 側で住所を保持 */
function migrateScheduleEventAddressOverridesV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_event_address_overrides (
      schedule_event_id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:schedule_event_address_overrides_v1") as { value_json: string } | undefined;
  if (marker) return;
  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:schedule_event_address_overrides_v1",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 案件 PDF QNAP バックアップ v1 — project_pdf_meta */
function migrateProjectPdfQnapBackupV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_pdf_qnap_backup_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS project_pdf_meta (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      local_path TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      qnap_backup_enabled INTEGER NOT NULL DEFAULT 0,
      qnap_backup_status TEXT,
      qnap_backup_path TEXT,
      qnap_backup_error TEXT,
      qnap_backup_attempts INTEGER NOT NULL DEFAULT 0,
      qnap_backup_last_attempt_at TEXT,
      qnap_backup_completed_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_project_pdf_meta_status
      ON project_pdf_meta(qnap_backup_status, qnap_backup_enabled)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_project_pdf_meta_project
      ON project_pdf_meta(project_id)
      WHERE deleted_at IS NULL;
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_pdf_qnap_backup_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** ストレージ設定 v1 — ローカル PDF + QNAP 接続（管理者 UI） */
function migrateStorageSettingsV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:storage_settings_v1") as { value_json: string } | undefined;
  if (marker) return;

  const SETTINGS_KEY = "storage_settings_v1";
  const row = database
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value_json: string } | undefined;
  if (!row) {
    const defaults = {
      localStorageEnabled: true,
      qnapBackupEnabled: false,
      qnap: { host: "", port: 8080, shareName: "TiSLY", username: "", password: "" },
      updatedAt: new Date().toISOString(),
    };
    database
      .prepare(
        `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
      )
      .run(SETTINGS_KEY, JSON.stringify(defaults));
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:storage_settings_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 現調PWA — IP/設備一覧（仕様書 PDF 反映） */
function migrateSurveyIpEquipmentV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:survey_ip_equipment_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_ip_equipment (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT '',
      device_type TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      login_id TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_survey_ip_equipment_project
      ON survey_ip_equipment(project_id);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:survey_ip_equipment_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 現場チェックリスト v1 — テンプレート管理 + 項目写真 + 集計 */
function migrateFieldChecklistV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:field_checklist_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS field_checklist_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_field_checklist_templates_active
      ON field_checklist_templates(active, sort_order);

    CREATE TABLE IF NOT EXISTS field_checklist_template_items (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      photo_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES field_checklist_templates(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_field_checklist_template_items_tpl
      ON field_checklist_template_items(template_id, sort_order);
  `);

  addColumnsIfMissing(database, "completion_checklist_items", [
    { name: "photo_id", ddl: "ALTER TABLE completion_checklist_items ADD COLUMN photo_id TEXT" },
    {
      name: "template_item_id",
      ddl: "ALTER TABLE completion_checklist_items ADD COLUMN template_item_id TEXT",
    },
    { name: "memo", ddl: "ALTER TABLE completion_checklist_items ADD COLUMN memo TEXT DEFAULT ''" },
  ]);

  addColumnsIfMissing(database, "project_work_sessions", [
    {
      name: "force_complete_reason",
      ddl: "ALTER TABLE project_work_sessions ADD COLUMN force_complete_reason TEXT",
    },
  ]);

  const seedTemplates: Array<{ name: string; sortOrder: number; items: string[] }> = [
    {
      name: "防犯カメラ",
      sortOrder: 0,
      items: [
        "電源確認",
        "ネット接続確認",
        "カメラ映像確認",
        "録画確認",
        "スマホ通知確認",
        "機器固定確認",
        "お客様説明済み",
        "清掃済み",
      ],
    },
    {
      name: "Wi-Fi",
      sortOrder: 1,
      items: ["電源確認", "接続確認", "速度確認", "カバレッジ確認", "お客様説明済み", "清掃済み"],
    },
    {
      name: "インターホン",
      sortOrder: 2,
      items: ["電源確認", "呼出確認", "モニター映像確認", "解錠確認", "お客様説明済み", "清掃済み"],
    },
    {
      name: "LAN配線",
      sortOrder: 3,
      items: ["配線確認", "通信確認", "スピード確認", "ラベル貼付", "清掃済み"],
    },
    {
      name: "電気工事",
      sortOrder: 4,
      items: ["電源確認", "ブレーカー確認", "配線確認", "動作確認", "清掃済み"],
    },
    {
      name: "TiSLY",
      sortOrder: 5,
      items: ["機器起動確認", "ネット接続確認", "アプリ連携確認", "通知確認", "お客様説明済み"],
    },
  ];

  const insertTpl = database.prepare(
    `INSERT INTO field_checklist_templates (id, name, description, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))`
  );
  const insertItem = database.prepare(
    `INSERT INTO field_checklist_template_items (id, template_id, label, sort_order, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );

  for (const tpl of seedTemplates) {
    const tplId = `fct-${tpl.name.replace(/\s+/g, "-")}`;
    insertTpl.run(tplId, tpl.name, `${tpl.name}工事の現場チェック`, tpl.sortOrder);
    tpl.items.forEach((label, i) => {
      insertItem.run(`${tplId}-item-${i}`, tplId, label, i, /映像|録画|通知/.test(label) ? 1 : 0);
    });
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:field_checklist_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 案件書類 v1 — PDF stale フラグ + 共有ログ */
function migrateProjectDocumentsV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_documents_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS project_pdf_stale (
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      stale_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_project_pdf_stale_project
      ON project_pdf_stale(project_id);

    CREATE TABLE IF NOT EXISTS pdf_share_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      document_kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      shared_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pdf_share_logs_project
      ON pdf_share_logs(project_id, shared_at DESC);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_documents_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 案件管理基盤 v1 — 市コード・案件ID採番・マスター拡張 */
function migrateProjectMgmtV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_mgmt_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS project_city_codes (
      city_code TEXT PRIMARY KEY,
      city_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_no_sequences (
      city_code TEXT NOT NULL,
      date_key TEXT NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (city_code, date_key),
      FOREIGN KEY (city_code) REFERENCES project_city_codes(city_code)
    );
    CREATE INDEX IF NOT EXISTS idx_project_no_sequences_date
      ON project_no_sequences(date_key);
  `);

  addColumnsIfMissing(database, "business_projects", [
    {
      name: "municipality",
      ddl: "ALTER TABLE business_projects ADD COLUMN municipality TEXT DEFAULT ''",
    },
    {
      name: "assignee",
      ddl: "ALTER TABLE business_projects ADD COLUMN assignee TEXT DEFAULT ''",
    },
    {
      name: "qnap_folder_path",
      ddl: "ALTER TABLE business_projects ADD COLUMN qnap_folder_path TEXT DEFAULT ''",
    },
    {
      name: "qnap_sync_status",
      ddl: "ALTER TABLE business_projects ADD COLUMN qnap_sync_status TEXT DEFAULT 'pending'",
    },
  ]);

  const seedCities: Array<[string, string, number]> = [
    ["MO", "守谷市", 0],
    ["JY", "常総市", 1],
    ["TS", "つくば市", 2],
    ["TM", "つくばみらい市", 3],
  ];
  const insertCity = database.prepare(
    `INSERT OR IGNORE INTO project_city_codes (city_code, city_name, sort_order, active)
     VALUES (?, ?, ?, 1)`
  );
  for (const [code, name, order] of seedCities) {
    insertCity.run(code, name, order);
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_mgmt_v1", JSON.stringify({ at: new Date().toISOString() }));
}
