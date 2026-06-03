-- Phase 321-340 PostgreSQL extensions (apply after schema.postgres.sql + tenants/sites from migration)

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_no INTEGER NOT NULL DEFAULT 0,
  floor_plan_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_maps (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL UNIQUE,
  image_path TEXT,
  width_px INTEGER,
  height_px INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_schedules (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  site_id TEXT,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  cron_expr TEXT,
  time_start TEXT,
  time_end TEXT,
  days_of_week_json JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_recovery_rules (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_device_type TEXT,
  action_type TEXT NOT NULL,
  action_target TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS pos_x DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pos_y DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS icon_type TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS rotation DOUBLE PRECISION DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS floor_id TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS zone_id TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS rssi INTEGER;
ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS cert_status TEXT DEFAULT 'unknown';
ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS serial TEXT;
