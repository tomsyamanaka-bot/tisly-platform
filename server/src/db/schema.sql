-- TiSLY Notification Platform — Phase 21-60 (SQLite)
-- PostgreSQL migration: TODO (see docs/unified_event_format.md)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_type TEXT NOT NULL,
  platform TEXT,
  device_id TEXT NOT NULL,
  label TEXT,
  last_heartbeat_at TEXT,
  heartbeat_status TEXT DEFAULT 'unknown',
  metadata_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_heartbeat ON devices(last_heartbeat_at);

CREATE TABLE IF NOT EXISTS device_heartbeats (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  tenant_id TEXT,
  site_id TEXT,
  source_type TEXT,
  status TEXT DEFAULT 'ok',
  payload_json TEXT,
  received_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_device_heartbeats_device ON device_heartbeats(device_id);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_received ON device_heartbeats(received_at);

CREATE TABLE IF NOT EXISTS tv_devices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  site_id TEXT,
  device_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  pairing_code TEXT,
  pairing_expires_at TEXT,
  paired_at TEXT,
  last_seen_at TEXT,
  status TEXT DEFAULT 'pending',
  settings_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tv_devices_site ON tv_devices(site_id);
CREATE INDEX IF NOT EXISTS idx_tv_devices_pairing ON tv_devices(pairing_code);

CREATE TABLE IF NOT EXISTS notification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  channel TEXT NOT NULL,
  token TEXT NOT NULL,
  endpoint TEXT,
  keys_json TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_tokens_user ON notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_tokens_channel ON notification_tokens(channel);

-- PWA Web Push subscriptions (mirrors web_push rows in notification_tokens)
CREATE TABLE IF NOT EXISTS pwa_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  user_agent TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pwa_subscriptions_user ON pwa_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  event_types_json TEXT NOT NULL,
  channels_json TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload_json TEXT,
  status TEXT DEFAULT 'pending',
  read_at TEXT,
  sent_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_logs_read ON notification_logs(read_at);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event ON notification_logs(event_type);

CREATE TABLE IF NOT EXISTS notification_queue (
  id TEXT PRIMARY KEY,
  log_id TEXT,
  channel TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TEXT,
  status TEXT DEFAULT 'queued',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (log_id) REFERENCES notification_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
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
  payload_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);
