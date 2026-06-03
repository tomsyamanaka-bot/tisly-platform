import type { IncidentSeverity, IncidentStatus } from "./incident-status.js";

/** Unified incident row (canonical: `incidents` table). */
export interface UnifiedIncident {
  id: string;
  device_id: string;
  site_id: string | null;
  customer_id: string | null;
  tenant_id: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  source: "incidents";
}

/** Legacy `recovery_incidents` shape used by customer portal / reports. */
export interface RecoveryIncidentView {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  device_id: string | null;
  status: string;
  playbook_id: string | null;
  created_at: string | null;
}

export function incidentToRecoveryView(row: UnifiedIncident): RecoveryIncidentView {
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

export function mapDbIncident(row: Record<string, unknown>): UnifiedIncident {
  return {
    id: String(row.id),
    device_id: String(row.device_id ?? ""),
    site_id: row.site_id != null ? String(row.site_id) : null,
    customer_id: row.customer_id != null ? String(row.customer_id) : null,
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    status: (row.status as IncidentStatus) ?? "open",
    severity: (row.severity as IncidentSeverity) ?? "info",
    title: row.title != null ? String(row.title) : null,
    opened_at: row.opened_at != null ? String(row.opened_at) : null,
    closed_at: row.closed_at != null ? String(row.closed_at) : null,
    created_at: String(row.created_at ?? ""),
    source: "incidents",
  };
}
