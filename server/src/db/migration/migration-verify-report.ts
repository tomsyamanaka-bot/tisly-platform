/**
 * Phase 301-320 — post-migration verification report.
 */
import type { Database } from "better-sqlite3";

export interface MigrationVerifyReport {
  generatedAt: string;
  sqlite: {
    customers: number;
    events: number;
    incidents: number;
    webhookDeliveries: number;
    reportEmailQueue: number;
  };
  ok: boolean;
  notes: string[];
}

export function buildMigrationVerifyReport(sqlite: Database): MigrationVerifyReport {
  const notes: string[] = [];
  const count = (table: string) => {
    try {
      return (sqlite.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;
    } catch {
      notes.push(`Table missing: ${table}`);
      return 0;
    }
  };

  const customers = count("customers");
  const events = count("events");
  const incidents = count("incidents");
  const webhookDeliveries = count("webhook_delivery_logs");
  const reportEmailQueue = count("report_email_queue");

  const ok = customers > 0 && notes.length === 0;
  if (customers < 3) {
    notes.push("Expected at least 3 demo customers (TOMS001/HOTEL001/PLANT001)");
  }

  return {
    generatedAt: new Date().toISOString(),
    sqlite: { customers, events, incidents, webhookDeliveries, reportEmailQueue },
    ok,
    notes,
  };
}
