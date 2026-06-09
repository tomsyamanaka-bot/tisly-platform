export function exportCustomersForPostgres(sqlite) {
    return sqlite
        .prepare(`SELECT customer_id, customer_code, customer_name, plan, status, tenant_id,
              stripe_customer_id, stripe_subscription_id, subscription_status,
              next_billing_date, last_invoice_status, contract_status,
              created_at, updated_at
       FROM customers WHERE status != 'deleted'`)
        .all();
}
