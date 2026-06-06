-- Phase 2251–2300 — QNAP 送信ログ
CREATE TABLE IF NOT EXISTS qnap_send_logs (
  id TEXT PRIMARY KEY,
  payload_type TEXT NOT NULL,
  customer_code TEXT,
  device_id TEXT,
  file_path TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  mock INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qnap_send_logs_created ON qnap_send_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_qnap_send_logs_type ON qnap_send_logs(payload_type);
