-- TiSLY Platform Phase 81-100 — AI Analytics + Recovery + QNAP

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  device_id TEXT,
  site_id TEXT,
  event_type TEXT NOT NULL,
  risk_score INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'info',
  factors_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_created ON analytics_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_risk ON analytics_snapshots(risk_score);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  site_id TEXT,
  status TEXT DEFAULT 'open',
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_device ON incidents(device_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

CREATE TABLE IF NOT EXISTS incident_timeline (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  device_id TEXT,
  site_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (incident_id) REFERENCES incidents(id)
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON incident_timeline(incident_id);

CREATE TABLE IF NOT EXISTS recovery_runs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  incident_id TEXT,
  status TEXT DEFAULT 'running',
  steps_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (incident_id) REFERENCES incidents(id)
);

CREATE INDEX IF NOT EXISTS idx_recovery_runs_device ON recovery_runs(device_id);

CREATE TABLE IF NOT EXISTS qnap_archives (
  id TEXT PRIMARY KEY,
  archive_type TEXT NOT NULL,
  format TEXT NOT NULL,
  file_path TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qnap_archives_created ON qnap_archives(created_at);
