export function exportIncidentsForPostgres(sqlite) {
    return sqlite
        .prepare(`SELECT id, tenant_id, customer_id, site_id, status, severity, title,
              description, created_at, updated_at, closed_at
       FROM incidents ORDER BY created_at DESC`)
        .all();
}
