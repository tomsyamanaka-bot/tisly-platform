export function buildMigrationVerifyReport(sqlite) {
    const notes = [];
    const count = (table) => {
        try {
            return sqlite.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
        }
        catch {
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
