import type Database from "better-sqlite3";
import { migrateLegacyDocNumbersIfNeededV1 } from "../business/legacy-doc-no-migration.js";
import { applyRetroactiveBackfillFlags } from "../projects/project-timeline-v1-retroactive-backfill.js";
import {
  seedMasterV1Categories,
  seedMasterV1CategorySamples,
} from "../master/master-v1-category-seed.js";
import { seedMasterV1CameraExpanded } from "../master/master-v1-camera-seed.js";

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
  migrateProjectMgmtV2(database);
  migrateProjectTimelineV1(database);
  migrateProjectTimelineV1BackfillFlag(database);
  migrateProjectTimelineV1RetroactiveBackfill(database);
  migrateSurveyDrawingSketchesV1(database);
  migrateMasterV1(database);
  migrateMasterV1Categories(database);
  migrateMasterV1EstimatePreview(database);
  migrateMasterV1EstimateApply(database);
  migrateAiEstimateEngineV1(database);
  migrateStorageDocumentsV1(database);
  migrateDocumentCenterV1(database);
  migrateDocumentCenterV15(database);
  migrateLegacyDocNumbersIfNeededV1(database);
  migrateProjectAutomationV1(database);
  migrateProjectAutomationV15(database);
  migrateSpecPhotoSlotsV1(database);
  migrateSpecPhotoTemplateMetaV1(database);
  migrateKnowledgePhotoMetaV1(database);
  migrateCustomerPortalMasterPhase23V1(database);
  migrateCustomerPortalPhase24V1(database);
  migrateCustomerPortalPhase26V1(database);
  migrateFieldCheckDrawingSyncV1(database);
  migrateTomsEstimateHistoryV1(database);
  migrateTenantSaasV1(database);
  migratePropertyDeviceBindingsV1(database);
  migrateDevicePortConfigsV1(database);
  migrateGasMonitorDemoSeedV1(database);
  migrateTislyHomeV1(database);
  migrateTislyHomeIntercomV1(database);
  migrateTislyHomeCustomerRegistryV1(database);
}

/**
 * TiSLY HOME 顧客物件レジストリ v1。
 * home_sites_v1 に連絡先・登録経路列を追記する。
 */
function migrateTislyHomeCustomerRegistryV1(
  database: Database.Database
): void {
  const cols = database
    .prepare(`PRAGMA table_info(home_sites_v1)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["contact_name", "TEXT NOT NULL DEFAULT ''"],
    ["contact_phone", "TEXT NOT NULL DEFAULT ''"],
    ["contact_email", "TEXT NOT NULL DEFAULT ''"],
    ["registration_source", "TEXT NOT NULL DEFAULT 'manual'"],
    ["linked_device_id", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, type] of additions) {
    if (!names.has(name)) {
      database.exec(`ALTER TABLE home_sites_v1 ADD COLUMN ${name} ${type}`);
    }
  }
}

/**
 * TiSLY HOME 住設統合 v1。
 * 月額課金 SaaS を見据えた
 * テナント / 物件 / デバイス / ログの
 * スケーラブルなスキーマを追加する。
 * 既存テーブルは一切変更しない。
 */
function migrateTislyHomeV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS home_sites_v1 (
      site_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_code TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT 'JP',
      currency TEXT NOT NULL DEFAULT 'JPY',
      kind TEXT NOT NULL DEFAULT 'detached',
      display_name TEXT NOT NULL,
      address_label TEXT NOT NULL DEFAULT '',
      voltage_spec TEXT NOT NULL DEFAULT '',
      hot_water_spec TEXT NOT NULL DEFAULT '',
      plan_code TEXT NOT NULL DEFAULT 'home_basic',
      plan_status TEXT NOT NULL DEFAULT 'active',
      monthly_fee REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS home_devices_v1 (
      site_id TEXT NOT NULL,
      device_kind TEXT NOT NULL
        CHECK (device_kind IN
          ('ct_panel', 'bath_remote', 'aircon',
           'smart_lock', 'intercom')),
      device_key TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      control_channel TEXT NOT NULL DEFAULT '',
      state_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, device_key)
    );

    CREATE TABLE IF NOT EXISTS home_control_logs_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      device_kind TEXT NOT NULL,
      device_key TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'app',
      result TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS home_access_logs_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      credential_type TEXT NOT NULL DEFAULT 'app',
      holder_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT 'unlock',
      occurred_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_home_devices_site
      ON home_devices_v1(site_id, device_kind);
    CREATE INDEX IF NOT EXISTS idx_home_control_logs_site
      ON home_control_logs_v1(site_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_home_access_logs_site
      ON home_access_logs_v1(site_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_home_sites_tenant
      ON home_sites_v1(tenant_id, plan_status);
  `);
}

/**
 * TiSLY HOME スマートインターホン v1。
 * home_devices_v1 の device_kind CHECK に 'intercom' を追加し、
 * 来客イベント表を新設する。
 * 既存行は削除せずコピーして引き継ぐ。
 */
function migrateTislyHomeIntercomV1(database: Database.Database): void {
  const table = database
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table' AND name = 'home_devices_v1'`
    )
    .get() as { sql?: string } | undefined;

  // SQLite は CHECK 制約を ALTER できないため
  // 新テーブルへ全行コピーして差し替える。
  if (table?.sql && !table.sql.includes("'intercom'")) {
    const rebuild = database.transaction(() => {
      database.exec(`
        CREATE TABLE home_devices_v1__intercom (
          site_id TEXT NOT NULL,
          device_kind TEXT NOT NULL
            CHECK (device_kind IN
              ('ct_panel', 'bath_remote', 'aircon',
               'smart_lock', 'intercom')),
          device_key TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          control_channel TEXT NOT NULL DEFAULT '',
          state_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (site_id, device_key)
        );
        INSERT OR IGNORE INTO home_devices_v1__intercom (
          site_id, device_kind, device_key, label,
          control_channel, state_json, updated_at
        )
        SELECT site_id, device_kind, device_key, label,
               control_channel, state_json, updated_at
        FROM home_devices_v1;
        DROP TABLE home_devices_v1;
        ALTER TABLE home_devices_v1__intercom
          RENAME TO home_devices_v1;
        CREATE INDEX IF NOT EXISTS idx_home_devices_site
          ON home_devices_v1(site_id, device_kind);
      `);
    });
    rebuild();
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS home_intercom_events_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      device_key TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL,
      visitor_label TEXT NOT NULL DEFAULT '',
      handled_as TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'app',
      occurred_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_home_intercom_events_site
      ON home_intercom_events_v1(site_id, id DESC);
  `);
}

/**
 * ガス監視 即時確認用シード v1。
 * TOMS設備デモ物件へ TISLY-BOX-001 を
 * 有効バインドし、DI1 をガスメーター
 * 使用中（360.58m³）として監視画面へ1件表示する。
 * 既存データは削除せず INSERT OR IGNORE のみ。
 */
function migrateGasMonitorDemoSeedV1(
  database: Database.Database
): void {
  // テストは専用DBで機器台数を厳密に検証するため
  // デモ機器のシードは本番・開発のみで投入する。
  // dotenv override で NODE_ENV が戻る場合があるので
  // DBファイル名でもテストDBを判定する。
  const dbPath = String((database as { name?: string }).name ?? "");
  if (
    process.env.NODE_ENV === "test" ||
    /test[-_].*\.db$/i.test(dbPath)
  ) {
    return;
  }

  const marker = database
    .prepare(
      "SELECT value_json FROM platform_settings WHERE key = ?"
    )
    .get("migration:gas_monitor_demo_seed_v1") as
    | { value_json: string }
    | undefined;
  if (marker) return;

  // 物件が無い環境ではシードしない（FK整合を保つ）。
  const property = database
    .prepare(
      `SELECT property_id, customer_code
       FROM customer_portal_properties
       WHERE property_id = ?`
    )
    .get("PROP-DEMOHOME001") as
    | { property_id: string; customer_code: string }
    | undefined;
  if (!property) return;

  const now = new Date().toISOString();
  const deviceId = "TISLY-BOX-001";

  database
    .prepare(
      `INSERT OR IGNORE INTO property_device_bindings_v1
       (id, customer_code, property_id, device_id,
        device_type, connection_status, bound_by, bound_at)
       VALUES (?, ?, ?, ?, 'RP2350', 'online', ?, ?)`
    )
    .run(
      "PDB-GASDEMO-BOX001",
      property.customer_code,
      property.property_id,
      deviceId,
      "seed",
      now
    );

  // DI1 = ガスメーター使用中（初期指針 360.58m³）。
  database
    .prepare(
      `INSERT OR IGNORE INTO device_port_configs_v1
       (device_id, port_type, port_number, enabled, label,
        operation_mode, contact_polarity, pulse_weight,
        pulse_unit, initial_meter_value, updated_at)
       VALUES (?, 'DI', 1, 1, ?, 'pulse', 'a',
               0.01, 'm³/P', 360.58, ?)`
    )
    .run(deviceId, "ガスメーター", now);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:gas_monitor_demo_seed_v1",
      JSON.stringify({ at: now, deviceId })
    );
}

/** TOMS 見積履歴ワンタップ保存 v1 */
function migrateTomsEstimateHistoryV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:toms_estimate_history_v1") as
    | { value_json: string }
    | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS toms_estimate_history_v1 (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      work_location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL DEFAULT '[]',
      subtotal INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      source_project_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_toms_estimate_history_v1_created
      ON toms_estimate_history_v1(created_at DESC);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:toms_estimate_history_v1",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 図面 ➔ 材料チェック自動同期 v1 */
function migrateFieldCheckDrawingSyncV1(database: Database.Database): void {
  addColumnsIfMissing(database, "field_check_items", [
    {
      name: "sync_key",
      ddl: "ALTER TABLE field_check_items ADD COLUMN sync_key TEXT",
    },
  ]);

  database.exec(`
    CREATE TABLE IF NOT EXISTS field_check_drawing_sync_state (
      project_source TEXT NOT NULL CHECK (project_source IN ('survey', 'business')),
      project_id TEXT NOT NULL,
      sketch_id TEXT,
      content_hash TEXT NOT NULL DEFAULT '',
      symbol_count INTEGER NOT NULL DEFAULT 0,
      line_count INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_source, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_field_check_drawing_sync_sketch
      ON field_check_drawing_sync_state(sketch_id);
  `);

  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:field_check_drawing_sync_v1") as { value_json: string } | undefined;
  if (marker) return;

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:field_check_drawing_sync_v1",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 現調図面 v1 — 方眼紙写真 + 描画レイヤー */
function migrateSurveyDrawingSketchesV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:survey_drawing_sketches_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS survey_drawing_sketches (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      business_project_id TEXT,
      title TEXT NOT NULL DEFAULT '現調図面',
      source_type TEXT NOT NULL DEFAULT 'photo',
      background_image_path TEXT NOT NULL DEFAULT '',
      layers_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES survey_projects(project_id) ON DELETE CASCADE
    );
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_survey_drawing_sketches_project ON survey_drawing_sketches(project_id)"
  );

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:survey_drawing_sketches_v1",
      JSON.stringify({ at: new Date().toISOString() })
    );
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

/** 案件親データ運用 v2 — project_timeline ビュー（business_project_timeline の別名） */
function migrateProjectMgmtV2(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_mgmt_v2") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE VIEW IF NOT EXISTS project_timeline AS
    SELECT id, project_id, event_type, title, detail, actor, metadata_json, created_at
    FROM business_project_timeline;
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_mgmt_v2", JSON.stringify({ at: new Date().toISOString() }));
}

/** 案件タイムライン v1 — project_timeline_events */
function migrateProjectTimelineV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_timeline_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS project_timeline_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES business_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_timeline_events_project
      ON project_timeline_events(project_id, created_at DESC);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_timeline_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 案件タイムライン v1 — backfill フラグ */
function migrateProjectTimelineV1BackfillFlag(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_timeline_v1_backfill_flag") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "project_timeline_events", [
    {
      name: "is_backfill",
      ddl: "ALTER TABLE project_timeline_events ADD COLUMN is_backfill INTEGER NOT NULL DEFAULT 0",
    },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:project_timeline_v1_backfill_flag",
      JSON.stringify({ at: new Date().toISOString() })
    );
}

/** 案件タイムライン v1 — 既存補完履歴の is_backfill 付与 */
function migrateProjectTimelineV1RetroactiveBackfill(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_timeline_v1_retroactive_backfill") as { value_json: string } | undefined;
  if (marker) return;

  const { projects, events } = applyRetroactiveBackfillFlags(database);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:project_timeline_v1_retroactive_backfill",
      JSON.stringify({ at: new Date().toISOString(), projects, events })
    );
}

/** 見積マスター v1 — 顧客/ランク/作業/材料/顧客別単価/記号マッピング */
function migrateMasterV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:master_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS master_v1_ranks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cost_multiplier REAL NOT NULL DEFAULT 2.0,
      labor_multiplier REAL NOT NULL DEFAULT 2.0,
      memo TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS master_v1_customers (
      id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      name TEXT NOT NULL,
      rank_id TEXT,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      memo TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (rank_id) REFERENCES master_v1_ranks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_customers_code ON master_v1_customers(customer_code);
    CREATE INDEX IF NOT EXISTS idx_master_v1_customers_favorite ON master_v1_customers(favorite);

    CREATE TABLE IF NOT EXISTS master_v1_work_items (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '式',
      standard_cost REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      memo TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_work_items_category ON master_v1_work_items(category);

    CREATE TABLE IF NOT EXISTS master_v1_materials (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      maker TEXT,
      model TEXT,
      unit TEXT NOT NULL DEFAULT '個',
      cost REAL NOT NULL DEFAULT 0,
      memo TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_materials_category ON master_v1_materials(category);

    CREATE TABLE IF NOT EXISTS master_v1_customer_prices (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('work', 'material')),
      item_id TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      memo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES master_v1_customers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_customer_prices_customer ON master_v1_customer_prices(customer_id);

    CREATE TABLE IF NOT EXISTS master_v1_symbol_mappings (
      id TEXT PRIMARY KEY,
      mapping_kind TEXT NOT NULL CHECK (mapping_kind IN ('symbol', 'line')),
      symbol_type TEXT NOT NULL,
      label TEXT NOT NULL,
      work_item_id TEXT,
      material_id TEXT,
      qty_per_unit REAL NOT NULL DEFAULT 1,
      memo TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (work_item_id) REFERENCES master_v1_work_items(id),
      FOREIGN KEY (material_id) REFERENCES master_v1_materials(id)
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_symbol_mappings_type ON master_v1_symbol_mappings(symbol_type, mapping_kind);
  `);

  seedMasterV1(database);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:master_v1", JSON.stringify({ at: new Date().toISOString() }));
}

function seedMasterV1(database: Database.Database): void {
  const now = new Date().toISOString();
  const insRank = database.prepare(
    `INSERT OR IGNORE INTO master_v1_ranks (id, name, cost_multiplier, labor_multiplier, memo, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const ranks: Array<[string, string, number, number, string, number]> = [
    ["rank-standard", "標準", 2.0, 2.0, "一般法人向け", 1],
    ["rank-premium", "プレミアム", 2.5, 2.5, "高品質案件", 2],
    ["rank-mgmt", "管理会社", 1.8, 1.8, "管理会社向け", 3],
  ];
  for (const [id, name, cm, lm, memo, sort] of ranks) {
    insRank.run(id, name, cm, lm, memo, sort, now, now);
  }

  const insWork = database.prepare(
    `INSERT OR IGNORE INTO master_v1_work_items (id, category, code, name, unit, standard_cost, labor_cost, memo, favorite, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const works: Array<[string, string, string, string, string, number, number, string, number, number]> = [
    ["work-camera-install", "防犯カメラ", "W-CAM-INST", "カメラ設置", "台", 15000, 8000, "ドーム/バレット共通", 1, 1],
    ["work-lan-wiring", "ネットワーク", "W-LAN", "LAN配線", "m", 800, 500, "UTPケーブル敷設", 1, 2],
    ["work-ap-install", "ネットワーク", "W-AP", "AP設置", "台", 12000, 6000, "無線AP取付・設定", 1, 3],
    ["work-nvr-setup", "設定", "W-NVR", "NVR設定", "式", 20000, 10000, "録画機初期設定", 1, 4],
    ["work-router-setup", "ネットワーク", "W-ROUTER", "ルーター設定", "式", 8000, 5000, "", 0, 5],
    ["work-sensor-install", "センサー", "W-SENSOR", "センサー設置", "台", 6000, 4000, "人感/ビーム/マグネット", 0, 6],
    ["work-power-wiring", "電気", "W-PWR", "電源配線", "m", 600, 400, "100V/24V", 0, 7],
  ];
  for (const [id, cat, code, name, unit, sc, lc, memo, fav, sort] of works) {
    insWork.run(id, cat, code, name, unit, sc, lc, memo, fav, sort, now, now);
  }

  const insMat = database.prepare(
    `INSERT OR IGNORE INTO master_v1_materials (id, category, code, name, maker, model, unit, cost, memo, favorite, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const mats: Array<[string, string, string, string, string | null, string | null, string, number, string, number, number]> = [
    ["mat-v1-dome-cam", "防犯カメラ", "M-DOME", "ドームカメラ", "TiSLY", "DC-200", "台", 18000, "", 1, 1],
    ["mat-v1-bullet-cam", "防犯カメラ", "M-BULLET", "バレットカメラ", "TiSLY", "BC-300", "台", 22000, "", 1, 2],
    ["mat-v1-lan-cable", "ケーブル", "M-LAN", "LANケーブル UTP", "汎用", "Cat6", "m", 120, "屋外対応", 1, 3],
    ["mat-v1-ap", "ネットワーク", "M-AP", "無線AP", "Ubiquiti", "U6-Pro", "台", 25000, "", 1, 4],
    ["mat-v1-nvr", "防犯カメラ", "M-NVR", "4ch NVR", "TiSLY", "NVR-4", "台", 45000, "", 1, 5],
    ["mat-v1-switch", "ネットワーク", "M-SW", "8port スイッチ", "汎用", "SW-8", "台", 8000, "", 0, 6],
    ["mat-v1-poe-injector", "電源", "M-POE", "PoEインジェクター", "汎用", "PoE+", "台", 3500, "", 0, 7],
  ];
  for (const [id, cat, code, name, maker, model, unit, cost, memo, fav, sort] of mats) {
    insMat.run(id, cat, code, name, maker, model, unit, cost, memo, fav, sort, now, now);
  }

  const insCust = database.prepare(
    `INSERT OR IGNORE INTO master_v1_customers (id, customer_code, name, rank_id, contact_name, phone, memo, favorite, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  insCust.run("cust-demo-a", "DEMO-A", "デモ顧客A株式会社", "rank-standard", "山田太郎", "029-000-0001", "見積マスターデモ", 1, 1, now, now);
  insCust.run("cust-demo-b", "DEMO-B", "デモ顧客B様", "rank-premium", "佐藤花子", "090-0000-0002", "", 0, 2, now, now);

  const insMap = database.prepare(
    `INSERT OR IGNORE INTO master_v1_symbol_mappings (id, mapping_kind, symbol_type, label, work_item_id, material_id, qty_per_unit, memo, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const maps: Array<[string, string, string, string, string | null, string | null, number, string, number]> = [
    ["map-dome-cam", "symbol", "dome_camera", "ドームカメラ", "work-camera-install", "mat-v1-dome-cam", 1, "", 1],
    ["map-bullet-cam", "symbol", "bullet_camera", "バレットカメラ", "work-camera-install", "mat-v1-bullet-cam", 1, "", 2],
    ["map-camera", "symbol", "camera", "カメラ", "work-camera-install", "mat-v1-dome-cam", 1, "v1互換", 3],
    ["map-lan-port", "symbol", "lan_port", "LAN", "work-lan-wiring", "mat-v1-lan-cable", 5, "端子あたり5m仮", 4],
    ["map-ap", "symbol", "access_point", "AP", "work-ap-install", "mat-v1-ap", 1, "", 5],
    ["map-nvr", "symbol", "nvr", "NVR", "work-nvr-setup", "mat-v1-nvr", 1, "", 6],
    ["map-router", "symbol", "router", "ルーター", "work-router-setup", null, 1, "", 7],
    ["map-switch", "symbol", "network_switch", "スイッチ", "work-router-setup", "mat-v1-switch", 1, "", 8],
    ["map-pir", "symbol", "pir_sensor", "人感センサー", "work-sensor-install", null, 1, "", 9],
    ["map-lan-line", "line", "lan", "LAN配線", "work-lan-wiring", "mat-v1-lan-cable", 1, "延長m換算", 10],
    ["map-power100v", "line", "power100v", "100V配線", "work-power-wiring", null, 1, "", 11],
    ["map-power24v", "line", "power24v", "24V配線", "work-power-wiring", null, 1, "", 12],
  ];
  for (const [id, kind, sym, label, wid, mid, qty, memo, sort] of maps) {
    insMap.run(id, kind, sym, label, wid, mid, qty, memo, sort, now, now);
  }

  const insPrice = database.prepare(
    `INSERT OR IGNORE INTO master_v1_customer_prices (id, customer_id, item_type, item_id, unit_price, cost_price, memo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insPrice.run("price-demo-a-cam", "cust-demo-a", "work", "work-camera-install", 28000, 23000, "顧客A カメラ設置単価", now, now);
  insPrice.run("price-demo-a-dome", "cust-demo-a", "material", "mat-v1-dome-cam", 36000, 18000, "顧客A ドームカメラ", now, now);
}

/** 見積マスター v1 カテゴリ強化 — 階層カテゴリ・タグ・記号マッピング拡張 */
function migrateMasterV1Categories(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:master_v1_categories") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS master_v1_categories (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('work', 'material', 'both')),
      category_main TEXT NOT NULL,
      category_sub TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, category_main, category_sub)
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_categories_main ON master_v1_categories(category_main);
  `);

  const workCols: Array<[string, string]> = [
    ["category_main", "TEXT"],
    ["category_sub", "TEXT DEFAULT ''"],
    ["tags", "TEXT DEFAULT '[]'"],
    ["default_quantity", "REAL NOT NULL DEFAULT 1"],
    ["standard_sell_price", "REAL NOT NULL DEFAULT 0"],
  ];
  for (const [col, ddl] of workCols) {
    try {
      database.exec(`ALTER TABLE master_v1_work_items ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  const matCols: Array<[string, string]> = [
    ["category_main", "TEXT"],
    ["category_sub", "TEXT DEFAULT ''"],
    ["tags", "TEXT DEFAULT '[]'"],
    ["default_quantity", "REAL NOT NULL DEFAULT 1"],
    ["standard_sell_price", "REAL NOT NULL DEFAULT 0"],
    ["supplier", "TEXT"],
    ["stock_managed", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [col, ddl] of matCols) {
    try {
      database.exec(`ALTER TABLE master_v1_materials ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  const mapCols: Array<[string, string]> = [
    ["category_main", "TEXT"],
    ["category_sub", "TEXT"],
    ["extra_material_ids", "TEXT DEFAULT '[]'"],
  ];
  for (const [col, ddl] of mapCols) {
    try {
      database.exec(`ALTER TABLE master_v1_symbol_mappings ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  database.exec(`
    UPDATE master_v1_work_items SET category_main = category WHERE category_main IS NULL OR category_main = '';
    UPDATE master_v1_materials SET category_main = category WHERE category_main IS NULL OR category_main = '';
    UPDATE master_v1_work_items SET standard_sell_price = standard_cost + labor_cost
      WHERE standard_sell_price IS NULL OR standard_sell_price = 0;
    UPDATE master_v1_materials SET standard_sell_price = cost * 2
      WHERE standard_sell_price IS NULL OR standard_sell_price = 0;
  `);

  seedMasterV1Categories(database);
  seedMasterV1CategorySamples(database);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:master_v1_categories", JSON.stringify({ at: new Date().toISOString() }));
}

/** 見積マスター v1 — AI見積プレビュー・draft保存・防犯カメラ拡張シード */
function migrateMasterV1EstimatePreview(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:master_v1_estimate_preview") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS master_v1_estimate_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      sketch_id TEXT,
      customer_id TEXT,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_master_v1_estimate_drafts_sketch ON master_v1_estimate_drafts(sketch_id);
    CREATE INDEX IF NOT EXISTS idx_master_v1_estimate_drafts_project ON master_v1_estimate_drafts(project_id);
  `);

  seedMasterV1CameraExpanded(database);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:master_v1_estimate_preview", JSON.stringify({ at: new Date().toISOString() }));
}

/** 見積マスター v1 → 見積PWA 連携 */
function migrateMasterV1EstimateApply(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:master_v1_estimate_apply") as { value_json: string } | undefined;
  if (marker) return;

  const draftCols: Array<[string, string]> = [
    ["business_project_id", "TEXT"],
    ["estimate_id", "TEXT"],
    ["applied_at", "TEXT"],
  ];
  for (const [col, ddl] of draftCols) {
    try {
      database.exec(`ALTER TABLE master_v1_estimate_drafts ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  try {
    database.exec(`ALTER TABLE business_estimates ADD COLUMN master_draft_id TEXT`);
  } catch {
    /* already exists */
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_master_v1_estimate_drafts_biz ON master_v1_estimate_drafts(business_project_id);
    CREATE INDEX IF NOT EXISTS idx_business_estimates_master_draft ON business_estimates(master_draft_id);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:master_v1_estimate_apply", JSON.stringify({ at: new Date().toISOString() }));
}

/** AI見積エンジン基盤 v1 — 顧客/ランク/作業の拡張フィールド + S/A/B/C ランク */
function migrateAiEstimateEngineV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:ai_estimate_engine_v1") as { value_json: string } | undefined;
  if (marker) return;

  const custCols: Array<[string, string]> = [
    ["customer_type", "TEXT DEFAULT '一般'"],
    ["standard_markup_rate", "REAL NOT NULL DEFAULT 2.0"],
    ["standard_discount_rate", "REAL NOT NULL DEFAULT 0"],
    ["standard_labor_unit_price", "REAL NOT NULL DEFAULT 8000"],
    ["standard_travel_fee", "REAL NOT NULL DEFAULT 5000"],
  ];
  for (const [col, ddl] of custCols) {
    try {
      database.exec(`ALTER TABLE master_v1_customers ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  const rankCols: Array<[string, string]> = [
    ["gross_margin_rate", "REAL NOT NULL DEFAULT 50"],
    ["discount_rate", "REAL NOT NULL DEFAULT 0"],
  ];
  for (const [col, ddl] of rankCols) {
    try {
      database.exec(`ALTER TABLE master_v1_ranks ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  const workCols: Array<[string, string]> = [
    ["standard_labor", "REAL NOT NULL DEFAULT 1"],
    ["standard_hours", "REAL NOT NULL DEFAULT 1"],
  ];
  for (const [col, ddl] of workCols) {
    try {
      database.exec(`ALTER TABLE master_v1_work_items ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* already exists */
    }
  }

  const now = new Date().toISOString();
  const insRank = database.prepare(
    `INSERT OR IGNORE INTO master_v1_ranks (
      id, name, cost_multiplier, labor_multiplier, gross_margin_rate, discount_rate, memo, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const aiRanks: Array<[string, string, number, number, number, number, string, number]> = [
    ["rank-s", "S", 2.5, 2.5, 55, 0, "最優先顧客", 1],
    ["rank-a", "A", 2.2, 2.2, 50, 2, "優良顧客", 2],
    ["rank-b", "B", 2.0, 2.0, 45, 5, "標準顧客", 3],
    ["rank-c", "C", 1.8, 1.8, 40, 8, "値引き多め", 4],
  ];
  for (const [id, name, cm, lm, gm, dr, memo, sort] of aiRanks) {
    insRank.run(id, name, cm, lm, gm, dr, memo, sort, now, now);
  }

  database.exec(`
    UPDATE master_v1_customers SET customer_type = '一般' WHERE customer_type IS NULL OR customer_type = '';
    UPDATE master_v1_customers SET standard_markup_rate = 2.0 WHERE standard_markup_rate IS NULL OR standard_markup_rate = 0;
    UPDATE master_v1_customers SET standard_labor_unit_price = 8000 WHERE standard_labor_unit_price IS NULL OR standard_labor_unit_price = 0;
    UPDATE master_v1_customers SET standard_travel_fee = 5000 WHERE standard_travel_fee IS NULL OR standard_travel_fee = 0;
    UPDATE master_v1_ranks SET gross_margin_rate = 50 WHERE gross_margin_rate IS NULL OR gross_margin_rate = 0;
    UPDATE master_v1_work_items SET standard_labor = 1 WHERE standard_labor IS NULL OR standard_labor = 0;
    UPDATE master_v1_work_items SET standard_hours = 1 WHERE standard_hours IS NULL OR standard_hours = 0;
  `);

  seedAiEstimateEngineCategories(database);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:ai_estimate_engine_v1", JSON.stringify({ at: new Date().toISOString() }));
}

function seedAiEstimateEngineCategories(database: Database.Database): void {
  const now = new Date().toISOString();
  const ins = database.prepare(
    `INSERT OR IGNORE INTO master_v1_categories (id, kind, category_main, category_sub, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const cats: Array<[string, string, string, string, number]> = [
    ["cat-phone-install", "both", "電話", "設置", 35],
    ["cat-phone-wiring", "both", "電話", "配線", 36],
    ["cat-wifi-setup", "work", "Wi-Fi / AP", "設定", 22],
  ];
  for (const [id, kind, main, sub, sort] of cats) {
    ins.run(id, kind, main, sub, sort, now, now);
  }
}

/** 保存分類 storage_documents_v1 — QNAP 状態管理 */
function migrateStorageDocumentsV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:storage_documents_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS storage_documents_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      local_path TEXT NOT NULL DEFAULT '',
      qnap_path TEXT,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'qnap_pending',
      customer_name TEXT,
      site_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_storage_documents_v1_project
      ON storage_documents_v1(project_id, document_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_storage_documents_v1_status
      ON storage_documents_v1(status);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:storage_documents_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Document Center v1 — source_type / favorites / recent */
function migrateDocumentCenterV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:document_center_v1") as { value_json: string } | undefined;
  if (marker) return;

  const cols = new Set(
    (database.prepare("PRAGMA table_info(storage_documents_v1)").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  if (!cols.has("source_type")) {
    database.exec(
      `ALTER TABLE storage_documents_v1 ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf'`
    );
  }

  database.exec(`
    UPDATE storage_documents_v1 SET document_type = 'specification' WHERE document_type = 'pdf';
    UPDATE storage_documents_v1 SET document_type = 'photo' WHERE document_type = 'photos';
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS document_center_favorites_v1 (
      project_id TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, username)
    );
    CREATE INDEX IF NOT EXISTS idx_document_center_favorites_username
      ON document_center_favorites_v1(username, created_at DESC);

    CREATE TABLE IF NOT EXISTS document_center_recent_v1 (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      project_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      preview_url TEXT,
      accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_document_center_recent_username
      ON document_center_recent_v1(username, accessed_at DESC);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:document_center_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Document Center v1.5 — workflow_status / memo */
function migrateDocumentCenterV15(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:document_center_v1_5") as { value_json: string } | undefined;
  if (marker) return;

  const cols = new Set(
    (database.prepare("PRAGMA table_info(storage_documents_v1)").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  );
  if (!cols.has("workflow_status")) {
    database.exec(
      `ALTER TABLE storage_documents_v1 ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'draft'`
    );
  }
  if (!cols.has("memo")) {
    database.exec(`ALTER TABLE storage_documents_v1 ADD COLUMN memo TEXT`);
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_storage_documents_v1_workflow
      ON storage_documents_v1(workflow_status);
    CREATE INDEX IF NOT EXISTS idx_storage_documents_v1_source_type
      ON storage_documents_v1(source_type);
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:document_center_v1_5", JSON.stringify({ at: new Date().toISOString() }));
}

/** 案件自動化エンジン v1 — テンプレートマスター + 案件紐付け */
function migrateProjectAutomationV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_automation_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS project_templates_v1 (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      sub_category TEXT NOT NULL DEFAULT '',
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_project_templates_v1_active
      ON project_templates_v1(active, sort_order);

    CREATE TABLE IF NOT EXISTS task_templates_v1 (
      id TEXT PRIMARY KEY,
      project_template_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_template_id) REFERENCES project_templates_v1(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_templates_v1_tpl
      ON task_templates_v1(project_template_id, sort_order);

    CREATE TABLE IF NOT EXISTS tool_templates_v1 (
      id TEXT PRIMARY KEY,
      project_template_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_template_id) REFERENCES project_templates_v1(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tool_templates_v1_tpl
      ON tool_templates_v1(project_template_id, sort_order);

    CREATE TABLE IF NOT EXISTS photo_templates_v1 (
      id TEXT PRIMARY KEY,
      project_template_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_template_id) REFERENCES project_templates_v1(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_photo_templates_v1_tpl
      ON photo_templates_v1(project_template_id, sort_order);

    CREATE TABLE IF NOT EXISTS project_tasks_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      template_item_id TEXT,
      label TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      done_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_project_tasks_v1_project
      ON project_tasks_v1(project_id, sort_order);

    CREATE TABLE IF NOT EXISTS project_tools_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      template_item_id TEXT,
      label TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_project_tools_v1_project
      ON project_tools_v1(project_id, sort_order);

    CREATE TABLE IF NOT EXISTS project_photos_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      template_item_id TEXT,
      label TEXT NOT NULL,
      photo_path TEXT,
      document_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      shot_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_project_photos_v1_project
      ON project_photos_v1(project_id, sort_order);

    CREATE TABLE IF NOT EXISTS ai_suggestions_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      suggestion_type TEXT NOT NULL,
      label TEXT NOT NULL,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_suggestions_v1_project
      ON ai_suggestions_v1(project_id, status);
  `);

  addColumnsIfMissing(database, "business_projects", [
    {
      name: "project_template_id",
      ddl: "ALTER TABLE business_projects ADD COLUMN project_template_id TEXT",
    },
  ]);

  type SeedTpl = {
    id: string;
    name: string;
    category: string;
    subCategory: string;
    sortOrder: number;
    tasks: string[];
    tools: string[];
    photos: string[];
  };

  const seeds: SeedTpl[] = [
    {
      id: "ptpl-camera",
      name: "防犯カメラ工事",
      category: "防犯",
      subCategory: "カメラ",
      sortOrder: 0,
      tasks: [
        "現場確認",
        "カメラ位置確認",
        "配線ルート確認",
        "LAN配線",
        "カメラ取付",
        "NVR設定",
        "録画確認",
        "スマホ設定",
        "操作説明",
        "完了写真",
      ],
      tools: [
        "カメラ",
        "NVR",
        "HDD",
        "LANケーブル",
        "RJ45",
        "PoEスイッチ",
        "ノートPC",
        "テスター",
        "脚立",
        "インパクト",
      ],
      photos: ["施工前全景", "施工後全景", "カメラ近景", "NVR", "モニター画面", "設定画面"],
    },
    {
      id: "ptpl-lan",
      name: "LAN工事",
      category: "ネットワーク",
      subCategory: "LAN",
      sortOrder: 1,
      tasks: ["現場確認", "配線ルート確認", "ケーブル敷設", "端子処理", "通信確認", "ラベル貼付", "完了写真"],
      tools: ["LANケーブル", "RJ45", "パンチダウンツール", "テスター", "ラベル", "脚立"],
      photos: ["施工前", "配線経路", "端子処理", "テスター画面", "完了全景"],
    },
    {
      id: "ptpl-wifi",
      name: "Wi-Fi工事",
      category: "ネットワーク",
      subCategory: "Wi-Fi",
      sortOrder: 2,
      tasks: ["現場確認", "電波測定", "AP設置", "設定", "速度確認", "カバレッジ確認", "お客様説明", "完了写真"],
      tools: ["Wi-Fiルーター", "AP", "LANケーブル", "ノートPC", "電波測定器"],
      photos: ["施工前", "AP設置位置", "設定画面", "速度テスト", "完了全景"],
    },
    {
      id: "ptpl-ap",
      name: "AP設置",
      category: "ネットワーク",
      subCategory: "AP",
      sortOrder: 3,
      tasks: ["設置位置確認", "取付", "配線", "設定", "接続確認", "完了写真"],
      tools: ["AP", "LANケーブル", "RJ45", "脚立", "ドリル"],
      photos: ["施工前", "AP近景", "設定画面", "完了全景"],
    },
    {
      id: "ptpl-intercom",
      name: "インターホン",
      category: "インターホン",
      subCategory: "一般",
      sortOrder: 4,
      tasks: ["現場確認", "配線確認", "親機取付", "子機取付", "呼出確認", "モニター確認", "解錠確認", "お客様説明", "完了写真"],
      tools: ["インターホン親機", "子機", "配線材", "テスター", "脚立"],
      photos: ["施工前", "親機", "子機", "モニター画面", "完了全景"],
    },
    {
      id: "ptpl-electric",
      name: "電気工事",
      category: "電気",
      subCategory: "一般",
      sortOrder: 5,
      tasks: ["現場確認", "電源確認", "配線", "器具取付", "動作確認", "ブレーカー確認", "完了写真"],
      tools: ["配線材", "テスター", "ドライバー", "ペンチ", "絶縁テープ"],
      photos: ["施工前", "配線", "器具", "動作確認", "完了全景"],
    },
    {
      id: "ptpl-lighting",
      name: "照明工事",
      category: "電気",
      subCategory: "照明",
      sortOrder: 6,
      tasks: ["現場確認", "器具選定確認", "取付", "配線", "点灯確認", "完了写真"],
      tools: ["照明器具", "配線材", "脚立", "ドライバー"],
      photos: ["施工前", "器具近景", "点灯後", "完了全景"],
    },
    {
      id: "ptpl-outlet",
      name: "コンセント工事",
      category: "電気",
      subCategory: "コンセント",
      sortOrder: 7,
      tasks: ["現場確認", "配線", "コンセント取付", "通電確認", "完了写真"],
      tools: ["コンセント", "配線材", "テスター", "ドライバー"],
      photos: ["施工前", "コンセント近景", "テスター確認", "完了全景"],
    },
    {
      id: "ptpl-breaker",
      name: "ブレーカー工事",
      category: "電気",
      subCategory: "ブレーカー",
      sortOrder: 8,
      tasks: ["現場確認", "分電盤確認", "ブレーカー交換", "配線確認", "動作確認", "完了写真"],
      tools: ["ブレーカー", "テスター", "絶縁手袋", "ドライバー"],
      photos: ["施工前", "分電盤", "交換後", "完了全景"],
    },
    {
      id: "ptpl-tv",
      name: "TV工事",
      category: "AV",
      subCategory: "TV",
      sortOrder: 9,
      tasks: ["現場確認", "壁掛け位置確認", "取付", "配線", "チャンネル確認", "お客様説明", "完了写真"],
      tools: ["TV", "壁掛け金具", "HDMIケーブル", "脚立", "レベル"],
      photos: ["施工前", "壁掛け", "配線", "画面表示", "完了全景"],
    },
    {
      id: "ptpl-antenna",
      name: "アンテナ工事",
      category: "AV",
      subCategory: "アンテナ",
      sortOrder: 10,
      tasks: ["現場確認", "受信確認", "アンテナ取付", "配線", "ブースター設定", "チャンネル確認", "完了写真"],
      tools: ["アンテナ", "同軸ケーブル", "ブースター", "脚立", "レベル"],
      photos: ["施工前", "アンテナ", "配線", "受信画面", "完了全景"],
    },
    {
      id: "ptpl-ac",
      name: "エアコン工事",
      category: "空調",
      subCategory: "エアコン",
      sortOrder: 11,
      tasks: ["現場確認", "室外機位置確認", "室内機取付", "室外機設置", "配管", "真空引き", "試運転", "お客様説明", "完了写真"],
      tools: ["エアコン本体", "配管セット", "真空ポンプ", "トルクレンチ", "脚立"],
      photos: ["施工前", "室内機", "室外機", "配管", "リモコン画面", "完了全景"],
    },
    {
      id: "ptpl-security",
      name: "セキュリティ工事",
      category: "セキュリティ",
      subCategory: "一般",
      sortOrder: 12,
      tasks: ["現場確認", "センサー設置", "制御盤設定", "警報確認", "アプリ連携", "お客様説明", "完了写真"],
      tools: ["センサー", "制御盤", "配線材", "ノートPC", "テスター"],
      photos: ["施工前", "センサー", "制御盤", "アプリ画面", "完了全景"],
    },
    {
      id: "ptpl-ev",
      name: "EV工事",
      category: "EV",
      subCategory: "充電",
      sortOrder: 13,
      tasks: ["現場確認", "分電盤確認", "充電器設置", "配線", "通電確認", "充電テスト", "お客様説明", "完了写真"],
      tools: ["EV充電器", "配線材", "ブレーカー", "テスター", "ケーブル"],
      photos: ["施工前", "充電器", "配線", "充電テスト", "完了全景"],
    },
    {
      id: "ptpl-other",
      name: "その他",
      category: "その他",
      subCategory: "一般",
      sortOrder: 99,
      tasks: ["現場確認", "作業実施", "動作確認", "お客様説明", "完了写真"],
      tools: ["工具セット", "テスター", "脚立"],
      photos: ["施工前", "作業中", "完了全景"],
    },
  ];

  const insertTpl = database.prepare(
    `INSERT INTO project_templates_v1 (id, name, category, sub_category, description, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`
  );
  const insertTask = database.prepare(
    `INSERT INTO task_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );
  const insertTool = database.prepare(
    `INSERT INTO tool_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );
  const insertPhoto = database.prepare(
    `INSERT INTO photo_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );

  for (const seed of seeds) {
    insertTpl.run(
      seed.id,
      seed.name,
      seed.category,
      seed.subCategory,
      `${seed.name}の標準テンプレート`,
      seed.sortOrder
    );
    seed.tasks.forEach((label, i) => {
      insertTask.run(`${seed.id}-task-${i}`, seed.id, label, i);
    });
    seed.tools.forEach((label, i) => {
      insertTool.run(`${seed.id}-tool-${i}`, seed.id, label, i);
    });
    seed.photos.forEach((label, i) => {
      insertPhoto.run(`${seed.id}-photo-${i}`, seed.id, label, i);
    });
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_automation_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 案件自動化エンジン v1.5 — メモ・使用回数・キャプション */
function migrateProjectAutomationV15(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:project_automation_v15") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "project_templates_v1", [
    {
      name: "use_count",
      ddl: "ALTER TABLE project_templates_v1 ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0",
    },
  ]);
  addColumnsIfMissing(database, "project_tasks_v1", [
    { name: "memo", ddl: "ALTER TABLE project_tasks_v1 ADD COLUMN memo TEXT" },
  ]);
  addColumnsIfMissing(database, "project_tools_v1", [
    { name: "memo", ddl: "ALTER TABLE project_tools_v1 ADD COLUMN memo TEXT" },
    {
      name: "forgotten_memo",
      ddl: "ALTER TABLE project_tools_v1 ADD COLUMN forgotten_memo TEXT",
    },
  ]);
  addColumnsIfMissing(database, "project_photos_v1", [
    { name: "caption", ddl: "ALTER TABLE project_photos_v1 ADD COLUMN caption TEXT" },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:project_automation_v15", JSON.stringify({ at: new Date().toISOString() }));
}

/** 仕様書 PDF v2 — 仕様書写真スロット */
function migrateSpecPhotoSlotsV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:spec_photo_slots_v1") as { value_json: string } | undefined;
  if (marker) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS spec_photo_templates_v1 (
      id TEXT PRIMARY KEY,
      project_template_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_template_id) REFERENCES project_templates_v1(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_spec_photo_templates_v1_tpl
      ON spec_photo_templates_v1(project_template_id, sort_order);

    CREATE TABLE IF NOT EXISTS spec_project_photos_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      template_item_id TEXT,
      label TEXT NOT NULL,
      photo_path TEXT,
      document_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      shot_at TEXT,
      caption TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_spec_project_photos_v1_project
      ON spec_project_photos_v1(project_id, sort_order);
  `);

  const labels = [
    "建物外観",
    "玄関",
    "設置予定位置",
    "配線ルート",
    "盤内",
    "ネットワーク機器",
    "問題箇所",
    "その他",
  ];
  const tplRows = database
    .prepare(`SELECT id FROM project_templates_v1`)
    .all() as Array<{ id: string }>;
  const insertTpl = database.prepare(
    `INSERT OR IGNORE INTO spec_photo_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );
  for (const tpl of tplRows) {
    labels.forEach((label, i) => {
      insertTpl.run(`${tpl.id}-spec-${i}`, tpl.id, label, i);
    });
  }

  const projectRows = database
    .prepare(`SELECT id, project_template_id FROM business_projects WHERE project_template_id IS NOT NULL`)
    .all() as Array<{ id: string; project_template_id: string }>;
  const insertSlot = database.prepare(
    `INSERT OR IGNORE INTO spec_project_photos_v1 (id, project_id, template_item_id, label, photo_path, document_id, sort_order, shot_at, caption, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, datetime('now'), datetime('now'))`
  );
  for (const proj of projectRows) {
    const hasSlots = database
      .prepare(`SELECT COUNT(*) AS c FROM spec_project_photos_v1 WHERE project_id = ?`)
      .get(proj.id) as { c: number };
    if (hasSlots.c > 0) continue;
    const specTpls = database
      .prepare(
        `SELECT id, label, sort_order FROM spec_photo_templates_v1 WHERE project_template_id = ? ORDER BY sort_order ASC`
      )
      .all(proj.project_template_id) as Array<{ id: string; label: string; sort_order: number }>;
    for (const st of specTpls) {
      insertSlot.run(`${proj.id}-spec-${st.sort_order}`, proj.id, st.id, st.label, st.sort_order);
    }
  }

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:spec_photo_slots_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** 仕様書写真スロット — required / memo / active 列 */
function migrateSpecPhotoTemplateMetaV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:spec_photo_template_meta_v1") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "spec_photo_templates_v1", [
    { name: "required", ddl: "ALTER TABLE spec_photo_templates_v1 ADD COLUMN required INTEGER NOT NULL DEFAULT 0" },
    { name: "memo", ddl: "ALTER TABLE spec_photo_templates_v1 ADD COLUMN memo TEXT" },
    { name: "active", ddl: "ALTER TABLE spec_photo_templates_v1 ADD COLUMN active INTEGER NOT NULL DEFAULT 1" },
  ]);
  addColumnsIfMissing(database, "spec_project_photos_v1", [
    { name: "required", ddl: "ALTER TABLE spec_project_photos_v1 ADD COLUMN required INTEGER NOT NULL DEFAULT 0" },
    { name: "memo", ddl: "ALTER TABLE spec_project_photos_v1 ADD COLUMN memo TEXT" },
    { name: "active", ddl: "ALTER TABLE spec_project_photos_v1 ADD COLUMN active INTEGER NOT NULL DEFAULT 1" },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:spec_photo_template_meta_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Knowledge Acquisition — 写真ナレッジ用メタ列 */
function migrateKnowledgePhotoMetaV1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:knowledge_photo_meta_v1") as { value_json: string } | undefined;
  if (marker) return;

  addColumnsIfMissing(database, "survey_photos", [
    { name: "knowledge_title", ddl: "ALTER TABLE survey_photos ADD COLUMN knowledge_title TEXT" },
    { name: "knowledge_category", ddl: "ALTER TABLE survey_photos ADD COLUMN knowledge_category TEXT" },
    { name: "knowledge_tags_json", ddl: "ALTER TABLE survey_photos ADD COLUMN knowledge_tags_json TEXT DEFAULT '[]'" },
  ]);
  addColumnsIfMissing(database, "completion_photos", [
    { name: "knowledge_title", ddl: "ALTER TABLE completion_photos ADD COLUMN knowledge_title TEXT" },
    { name: "knowledge_category", ddl: "ALTER TABLE completion_photos ADD COLUMN knowledge_category TEXT" },
    { name: "knowledge_tags_json", ddl: "ALTER TABLE completion_photos ADD COLUMN knowledge_tags_json TEXT DEFAULT '[]'" },
  ]);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:knowledge_photo_meta_v1", JSON.stringify({ at: new Date().toISOString() }));
}

/** Phase23 — Customer Master / Property Master / customer-files PDF 統合 */
function migrateCustomerPortalMasterPhase23V1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_portal_master_phase23_v1") as { value_json: string } | undefined;

  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_portal_master (
      customer_code TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      contact_name TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      contact_email TEXT DEFAULT '',
      plan TEXT DEFAULT 'PRO_REMOTE',
      status TEXT DEFAULT 'active',
      business_customer_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customer_portal_properties (
      property_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      property_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      project_ref TEXT,
      installed_date TEXT,
      next_inspection_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cpp_customer ON customer_portal_properties(customer_code);
    CREATE INDEX IF NOT EXISTS idx_cpp_project_ref ON customer_portal_properties(project_ref);
    CREATE TABLE IF NOT EXISTS customer_portal_documents (
      id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      property_id TEXT,
      project_ref TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cpd_project_ref ON customer_portal_documents(project_ref);
    CREATE TABLE IF NOT EXISTS customer_contact_settings (
      customer_code TEXT PRIMARY KEY,
      phone_enabled INTEGER NOT NULL DEFAULT 1,
      email_enabled INTEGER NOT NULL DEFAULT 1,
      form_enabled INTEGER NOT NULL DEFAULT 1,
      form_url TEXT DEFAULT 'https://toms.co.jp/contact',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  if (marker) return;

  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT OR IGNORE INTO customer_portal_master
       (customer_code, customer_name, address, contact_name, contact_phone, contact_email, plan, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("TOMS001", "TOMS設備デモ", "守谷市", "山中様", "048-594-7077", "info@toms.co.jp", "PRO_REMOTE", "active", now, now);

  database
    .prepare(
      `INSERT OR IGNORE INTO customer_portal_properties
       (property_id, customer_code, property_name, address, project_ref, installed_date, next_inspection_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "PROP-DEMOHOME001",
      "TOMS001",
      "デモ戸建て防犯",
      "守谷市",
      "DEMO-HOME-001",
      null,
      null,
      now,
      now
    );

  database
    .prepare(
      `INSERT OR IGNORE INTO customer_contact_settings
       (customer_code, phone_enabled, email_enabled, form_enabled, form_url, updated_at)
       VALUES (?, 1, 1, 1, ?, ?)`
    )
    .run("TOMS001", "https://toms.co.jp/contact", now);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:customer_portal_master_phase23_v1", JSON.stringify({ at: now }));
}

/** Phase24 — TOMS表記統一 · 文字化け修正 · デモ物件名更新 */
function migrateCustomerPortalPhase24V1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_portal_phase24_v1") as { value_json: string } | undefined;
  if (marker) return;

  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE customer_portal_master SET customer_name = ?, updated_at = ? WHERE customer_code = ?`
    )
    .run("TOMS設備デモ", now, "TOMS001");

  database
    .prepare(`UPDATE customer_portal_master SET customer_name = REPLACE(customer_name, 'トムズ', 'TOMS') WHERE customer_name LIKE '%トムズ%'`)
    .run();

  database
    .prepare(
      `UPDATE customer_portal_properties SET property_name = ?, updated_at = ? WHERE project_ref = ?`
    )
    .run("TOMS設備デモ", now, "DEMO-HOME-001");

  database
    .prepare(
      `UPDATE customer_portal_properties SET property_name = REPLACE(property_name, '????', '') WHERE property_name LIKE '%?%'`
    )
    .run();

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:customer_portal_phase24_v1", JSON.stringify({ at: now }));
}

/** Phase26 — 実運用同期 · 通知 · 契約プラン */
function migrateCustomerPortalPhase26V1(database: Database.Database): void {
  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:customer_portal_phase26_v1") as { value_json: string } | undefined;

  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_portal_notifications (
      id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      property_id TEXT,
      project_ref TEXT,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      href TEXT,
      dedupe_key TEXT,
      push_payload_json TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cpn_customer ON customer_portal_notifications(customer_code);
    CREATE INDEX IF NOT EXISTS idx_cpn_dedupe ON customer_portal_notifications(customer_code, dedupe_key);
  `);

  if (marker) return;

  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE customer_portal_master SET plan = 'PRO' WHERE plan IN ('PRO_REMOTE', 'Lite')`
    )
    .run();
  database
    .prepare(
      `UPDATE customer_portal_master SET plan = 'Standard' WHERE plan NOT IN ('Free','Notify','Standard','PRO','Enterprise')`
    )
    .run();

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run("migration:customer_portal_phase26_v1", JSON.stringify({ at: now }));
}

/**
 * Tenant SaaS v1 — 組織・マルチ通貨・契約状態。
 * 既存データは削除せず、列追記と NULL 埋めのみ。
 */
function migrateTenantSaasV1(database: Database.Database): void {
  const customerCols: Array<{ name: string; ddl: string }> = [
    {
      name: "country_code",
      ddl: "ALTER TABLE customers ADD COLUMN country_code TEXT DEFAULT 'JP'",
    },
    {
      name: "currency",
      ddl: "ALTER TABLE customers ADD COLUMN currency TEXT DEFAULT 'JPY'",
    },
    {
      name: "plan_status",
      ddl: "ALTER TABLE customers ADD COLUMN plan_status TEXT DEFAULT 'active'",
    },
    {
      name: "monthly_fee",
      ddl: "ALTER TABLE customers ADD COLUMN monthly_fee REAL DEFAULT 0",
    },
  ];
  addColumnsIfMissing(database, "customers", customerCols);

  const deviceCols: Array<{ name: string; ddl: string }> = [
    {
      name: "tenant_id",
      ddl: "ALTER TABLE devices ADD COLUMN tenant_id TEXT",
    },
    {
      name: "country_code",
      ddl: "ALTER TABLE devices ADD COLUMN country_code TEXT DEFAULT 'JP'",
    },
    {
      name: "currency",
      ddl: "ALTER TABLE devices ADD COLUMN currency TEXT DEFAULT 'JPY'",
    },
    {
      name: "plan_status",
      ddl: "ALTER TABLE devices ADD COLUMN plan_status TEXT DEFAULT 'active'",
    },
    {
      name: "monthly_fee",
      ddl: "ALTER TABLE devices ADD COLUMN monthly_fee REAL DEFAULT 0",
    },
  ];
  addColumnsIfMissing(database, "devices", deviceCols);

  // 既存行の NULL のみ既定値で埋める（上書きしない）
  database.exec(`
    UPDATE customers SET
      country_code = COALESCE(country_code, 'JP'),
      currency = COALESCE(currency, 'JPY'),
      plan_status = COALESCE(plan_status, 'active'),
      monthly_fee = COALESCE(monthly_fee, 0),
      tenant_id = COALESCE(tenant_id, customer_id)
    WHERE country_code IS NULL
       OR currency IS NULL
       OR plan_status IS NULL
       OR monthly_fee IS NULL
       OR tenant_id IS NULL;
  `);

  database.exec(`
    UPDATE devices SET
      tenant_id = COALESCE(
        tenant_id,
        (SELECT c.tenant_id FROM customers c WHERE c.customer_id = devices.customer_id),
        customer_id
      ),
      country_code = COALESCE(
        country_code,
        (SELECT c.country_code FROM customers c WHERE c.customer_id = devices.customer_id),
        'JP'
      ),
      currency = COALESCE(
        currency,
        (SELECT c.currency FROM customers c WHERE c.customer_id = devices.customer_id),
        'JPY'
      ),
      plan_status = COALESCE(
        plan_status,
        (SELECT c.plan_status FROM customers c WHERE c.customer_id = devices.customer_id),
        'active'
      ),
      monthly_fee = COALESCE(
        monthly_fee,
        (SELECT c.monthly_fee FROM customers c WHERE c.customer_id = devices.customer_id),
        0
      )
    WHERE tenant_id IS NULL
       OR country_code IS NULL
       OR currency IS NULL
       OR plan_status IS NULL
       OR monthly_fee IS NULL;
  `);

  const marker = database
    .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
    .get("migration:tenant_saas_v1") as { value_json: string } | undefined;
  if (marker) return;

  // 初回のみデモ顧客の表示用初期値を追記
  database.exec(`
    UPDATE customers SET
      plan_status = 'active',
      country_code = COALESCE(country_code, 'JP'),
      currency = COALESCE(currency, 'JPY'),
      monthly_fee = CASE WHEN COALESCE(monthly_fee, 0) = 0 THEN 9800 ELSE monthly_fee END
    WHERE customer_code = 'TOMS001';

    UPDATE customers SET
      plan_status = 'trial',
      country_code = COALESCE(country_code, 'JP'),
      currency = COALESCE(currency, 'JPY'),
      monthly_fee = COALESCE(monthly_fee, 0)
    WHERE customer_code = 'DEMO001';
  `);

  database
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))`
    )
    .run(
      "migration:tenant_saas_v1",
      JSON.stringify({ at: new Date().toISOString(), version: "v1" })
    );
}

/**
 * RP2350 物件紐付け v1。
 * 既存テーブルは変更せず追記する。
 */
function migratePropertyDeviceBindingsV1(
  database: Database.Database
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS property_device_bindings_v1 (
      id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL,
      property_id TEXT NOT NULL,
      device_id TEXT NOT NULL UNIQUE,
      device_type TEXT NOT NULL DEFAULT 'RP2350',
      connection_status TEXT NOT NULL DEFAULT 'online',
      bound_by TEXT,
      bound_at TEXT NOT NULL,
      FOREIGN KEY (property_id)
        REFERENCES customer_portal_properties(property_id)
    );
    CREATE INDEX IF NOT EXISTS idx_property_device_bindings_property
      ON property_device_bindings_v1(customer_code, property_id);
  `);
}

/**
 * RP2350 8DI/8RO 現場マッピング v1。
 * 既存テーブルと既存設定は変更しない。
 */
function migrateDevicePortConfigsV1(
  database: Database.Database
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS device_port_configs_v1 (
      device_id TEXT NOT NULL,
      port_type TEXT NOT NULL CHECK (port_type IN ('DI', 'RO')),
      port_number INTEGER NOT NULL
        CHECK (port_number BETWEEN 1 AND 8),
      enabled INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL DEFAULT '',
      operation_mode TEXT NOT NULL DEFAULT 'pulse',
      contact_polarity TEXT NOT NULL DEFAULT 'a',
      pulse_weight REAL NOT NULL DEFAULT 0.01,
      pulse_unit TEXT NOT NULL DEFAULT 'm³/P',
      initial_meter_value REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (device_id, port_type, port_number),
      FOREIGN KEY (device_id)
        REFERENCES property_device_bindings_v1(device_id)
    );

    CREATE TABLE IF NOT EXISTS device_rs485_configs_v1 (
      device_id TEXT NOT NULL,
      modbus_address INTEGER NOT NULL
        CHECK (modbus_address BETWEEN 1 AND 32),
      equipment_name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (device_id, modbus_address),
      FOREIGN KEY (device_id)
        REFERENCES property_device_bindings_v1(device_id)
    );

    CREATE TABLE IF NOT EXISTS device_field_notes_v1 (
      device_id TEXT PRIMARY KEY,
      field_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (device_id)
        REFERENCES property_device_bindings_v1(device_id)
    );

    CREATE INDEX IF NOT EXISTS idx_device_port_configs_enabled
      ON device_port_configs_v1(device_id, enabled);

    CREATE TABLE IF NOT EXISTS device_port_telemetry_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      port_number INTEGER NOT NULL
        CHECK (port_number BETWEEN 1 AND 8),
      input_state TEXT NOT NULL DEFAULT 'off',
      pulse_count REAL NOT NULL DEFAULT 0,
      meter_value REAL NOT NULL DEFAULT 0,
      reading_date TEXT NOT NULL,
      received_at TEXT NOT NULL,
      FOREIGN KEY (device_id)
        REFERENCES property_device_bindings_v1(device_id)
    );

    CREATE INDEX IF NOT EXISTS idx_device_port_telemetry_latest
      ON device_port_telemetry_v1(device_id, port_number, id DESC);

    CREATE INDEX IF NOT EXISTS idx_device_port_telemetry_daily
      ON device_port_telemetry_v1(
        device_id, port_number, reading_date, id
      );

    CREATE TABLE IF NOT EXISTS device_emergency_events_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      property_id TEXT NOT NULL,
      port_number INTEGER NOT NULL
        CHECK (port_number BETWEEN 1 AND 8),
      label TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 0,
      received_at TEXT NOT NULL,
      FOREIGN KEY (device_id)
        REFERENCES property_device_bindings_v1(device_id)
    );

    CREATE INDEX IF NOT EXISTS idx_device_emergency_events_latest
      ON device_emergency_events_v1(device_id, id DESC);
  `);
}
