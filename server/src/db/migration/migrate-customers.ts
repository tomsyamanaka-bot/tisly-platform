/**
 * Phase 301-320 — migrate customers billing columns to Postgres.
 * Run via migrate-cli or sqlite-to-postgres pipeline.
 */
import type { Database } from "better-sqlite3";

export function exportCustomersForPostgres(sqlite: Database): Array<Record<string, unknown>> {
  return sqlite
    .prepare(
      `SELECT customer_id, customer_code, customer_name, plan, status, tenant_id,
              stripe_customer_id, stripe_subscription_id, subscription_status,
              next_billing_date, last_invoice_status, contract_status,
              created_at, updated_at
       FROM customers WHERE status != 'deleted'`
    )
    .all() as Array<Record<string, unknown>>;
}
