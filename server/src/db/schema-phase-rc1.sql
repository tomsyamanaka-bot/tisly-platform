-- TiSLY Platform Phase 141-160 RC1

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  metadata_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_id TEXT,
  site_type TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  dashboard_json TEXT,
  metadata_json TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_sites_tenant ON sites(tenant_id);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  zone_type TEXT,
  sort_order INTEGER DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE INDEX IF NOT EXISTS idx_zones_site ON zones(site_id);

CREATE TABLE IF NOT EXISTS device_credentials (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  site_id TEXT NOT NULL,
  zone_id TEXT,
  tenant_id TEXT NOT NULL,
  provisioned_at TEXT DEFAULT (datetime('now')),
  rotated_at TEXT,
  status TEXT DEFAULT 'active',
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE INDEX IF NOT EXISTS idx_device_credentials_site ON device_credentials(site_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  site_id TEXT,
  actor_id TEXT,
  actor_label TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS notification_rule_conditions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  site_id TEXT,
  name TEXT NOT NULL,
  sensor_type TEXT,
  time_window TEXT,
  severity TEXT DEFAULT 'critical',
  channels_json TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
