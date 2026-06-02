-- TiSLY Platform Phase 161-180 Security Hardened RC1

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  status TEXT NOT NULL,
  file_path TEXT,
  size_bytes INTEGER,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_started ON backup_runs(started_at);

CREATE TABLE IF NOT EXISTS report_exports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  site_id TEXT,
  format TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_exports_generated ON report_exports(generated_at);

CREATE TABLE IF NOT EXISTS tv_pairing_attempts (
  device_id TEXT NOT NULL,
  ip_address TEXT,
  attempt_count INTEGER DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, ip_address)
);
