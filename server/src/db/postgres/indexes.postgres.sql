-- TiSLY Platform — PostgreSQL indexes (Phase 181-200)

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_heartbeat ON devices(last_heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency
  ON events(tenant_id, site_id, device_id, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);

CREATE INDEX IF NOT EXISTS idx_qnap_archives_created ON qnap_archives(created_at);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_device ON recovery_actions(device_id);

CREATE INDEX IF NOT EXISTS idx_tv_devices_site ON tv_devices(site_id);
CREATE INDEX IF NOT EXISTS idx_tv_devices_pairing ON tv_devices(pairing_code);
