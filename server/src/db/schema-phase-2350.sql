-- Phase 2301–2350 — Gmail SMTP 送信ログ
CREATE TABLE IF NOT EXISTS gmail_send_logs (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  send_type TEXT NOT NULL DEFAULT 'notification',
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'mock')),
  error_message TEXT,
  mock INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gmail_send_logs_created ON gmail_send_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_send_logs_status ON gmail_send_logs(status);
