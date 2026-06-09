export function incidentToRecoveryView(row) {
    return {
        id: row.id,
        tenant_id: row.tenant_id,
        customer_id: row.customer_id,
        device_id: row.device_id,
        status: row.status === "closed" || row.status === "resolved" ? "closed" : "open",
        playbook_id: null,
        created_at: row.opened_at ?? row.created_at,
    };
}
export function mapDbIncident(row) {
    return {
        id: String(row.id),
        device_id: String(row.device_id ?? ""),
        site_id: row.site_id != null ? String(row.site_id) : null,
        customer_id: row.customer_id != null ? String(row.customer_id) : null,
        tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
        status: row.status ?? "open",
        severity: row.severity ?? "info",
        title: row.title != null ? String(row.title) : null,
        opened_at: row.opened_at != null ? String(row.opened_at) : null,
        closed_at: row.closed_at != null ? String(row.closed_at) : null,
        created_at: String(row.created_at ?? ""),
        source: "incidents",
    };
}
