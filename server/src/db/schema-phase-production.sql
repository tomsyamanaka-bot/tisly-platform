-- TiSLY Platform Phase 181-200 — Production Security Foundation

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS totp_secrets (
  user_id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency
  ON events(tenant_id, site_id, device_id, event_id)
  WHERE event_id IS NOT NULL;
