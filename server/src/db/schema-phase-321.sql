-- TiSLY Platform Phase 321-340 — Site Builder & Map Foundation

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_no INTEGER NOT NULL DEFAULT 0,
  floor_plan_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE INDEX IF NOT EXISTS idx_floors_site ON floors(site_id);

CREATE TABLE IF NOT EXISTS floor_maps (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL UNIQUE,
  image_path TEXT,
  width_px INTEGER,
  height_px INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (floor_id) REFERENCES floors(id)
);

CREATE TABLE IF NOT EXISTS camera_devices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  site_id TEXT,
  zone_id TEXT,
  device_id TEXT,
  channel INTEGER DEFAULT 1,
  rtsp_url TEXT,
  camera_name TEXT NOT NULL,
  camera_group TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_camera_devices_customer ON camera_devices(customer_id);

CREATE TABLE IF NOT EXISTS customer_schedules (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  site_id TEXT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('armed', 'disarmed', 'business', 'night')),
  cron_expr TEXT,
  time_start TEXT,
  time_end TEXT,
  days_of_week_json TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_schedules_customer ON customer_schedules(customer_id);

CREATE TABLE IF NOT EXISTS customer_recovery_rules (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_device_type TEXT,
  action_type TEXT NOT NULL,
  action_target TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_recovery_rules_customer ON customer_recovery_rules(customer_id);
