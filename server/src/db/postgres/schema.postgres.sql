-- TiSLY Platform — PostgreSQL schema (Phase 181-200)
-- Apply: psql -f schema.postgres.sql && psql -f indexes.postgres.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  device_type TEXT NOT NULL,
  platform TEXT,
  device_id TEXT NOT NULL,
  label TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  heartbeat_status TEXT DEFAULT 'unknown',
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tv_devices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  site_id TEXT,
  device_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  pairing_code TEXT,
  pairing_expires_at TIMESTAMPTZ,
  paired_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  settings_json JSONB,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  tenant_id TEXT,
  site_id TEXT,
  device_id TEXT NOT NULL,
  source_type TEXT,
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  zone TEXT,
  message TEXT,
  title TEXT,
  body TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  site_id TEXT,
  user_id TEXT,
  actor_id TEXT,
  actor_label TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  target_type TEXT,
  target_id TEXT,
  details_json JSONB,
  before_json JSONB,
  after_json JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload_json JSONB,
  status TEXT DEFAULT 'pending',
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id TEXT PRIMARY KEY,
  log_id TEXT,
  channel TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  status TEXT DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qnap_archives (
  id TEXT PRIMARY KEY,
  archive_type TEXT NOT NULL,
  format TEXT NOT NULL,
  file_path TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_actions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  site_id TEXT,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  trigger_source TEXT,
  details_json JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_credentials (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  secret_encrypted TEXT,
  site_id TEXT NOT NULL,
  zone_id TEXT,
  tenant_id TEXT NOT NULL,
  provisioned_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS totp_secrets (
  user_id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
