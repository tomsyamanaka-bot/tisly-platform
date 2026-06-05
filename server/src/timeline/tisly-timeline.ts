import { getDatabase } from "../db/database.js";
import { listSurveyProjects } from "../survey/survey-store.js";
import { listMaintenanceReports } from "../maintenance/maintenance-schedule.js";

export type TimelineCategory =
  | "Survey"
  | "Estimate"
  | "Construction"
  | "Device"
  | "Alert"
  | "Maintenance";

export interface TislyTimelineEvent {
  id: string;
  category: TimelineCategory;
  title: string;
  detail: string;
  projectId: string | null;
  customerCode: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

function mapEventType(eventType: string): TimelineCategory {
  const t = eventType.toLowerCase();
  if (t.includes("survey") || t === "drawing") return "Survey";
  if (t.includes("estimate") || t.includes("invoice") || t.includes("payment")) return "Estimate";
  if (t.includes("construction") || t.includes("completion")) return "Construction";
  if (t.includes("device") || t.includes("pro_operations")) return "Device";
  if (t.includes("alert") || t.includes("alarm")) return "Alert";
  if (t.includes("maintenance")) return "Maintenance";
  return "Construction";
}

export function buildUnifiedTimeline(filters?: {
  projectId?: string;
  customerCode?: string;
  limit?: number;
}): TislyTimelineEvent[] {
  const limit = filters?.limit ?? 200;
  const events: TislyTimelineEvent[] = [];

  const db = getDatabase();

  let timelineSql = `SELECT * FROM business_project_timeline WHERE 1=1`;
  const timelineParams: unknown[] = [];
  if (filters?.projectId) {
    timelineSql += ` AND project_id = ?`;
    timelineParams.push(filters.projectId);
  }
  timelineSql += ` ORDER BY created_at DESC LIMIT ?`;
  timelineParams.push(limit);

  const timelineRows = db.prepare(timelineSql).all(...timelineParams) as Array<
    Record<string, unknown>
  >;
  for (const r of timelineRows) {
    const eventType = String(r.event_type);
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(String(r.metadata_json ?? "{}")) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    const projectId = String(r.project_id);
    const project = db
      .prepare(`SELECT customer_id FROM business_projects WHERE id = ?`)
      .get(projectId) as { customer_id: string } | undefined;
    events.push({
      id: String(r.id),
      category: mapEventType(eventType),
      title: String(r.title),
      detail: String(r.detail ?? ""),
      projectId,
      customerCode: project?.customer_id ?? null,
      createdAt: String(r.created_at),
      metadata: { ...metadata, eventType },
    });
  }

  if (filters?.customerCode) {
    const code = filters.customerCode.toUpperCase();
    for (const sp of listSurveyProjects(code)) {
      events.push({
        id: `SVY-TL-${sp.projectId}`,
        category: "Survey",
        title: `現調: ${sp.siteName}`,
        detail: sp.address ?? "",
        projectId: null,
        customerCode: code,
        createdAt: sp.updatedAt,
        metadata: { surveyProjectId: sp.projectId, status: sp.status },
      });
    }
    for (const report of listMaintenanceReports(code, 30)) {
      events.push({
        id: `MNT-RPT-${report.reportId}`,
        category: "Maintenance",
        title: "保守完了報告",
        detail: report.comment ?? "",
        projectId: null,
        customerCode: code,
        createdAt: report.completedAt,
        metadata: { reportId: report.reportId, photoCount: report.photos.length },
      });
    }
  }

  const deviceSql = filters?.customerCode
    ? `SELECT * FROM device_timeline WHERE customer_id IN
       (SELECT customer_id FROM customers WHERE customer_code = ?)
       ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM device_timeline ORDER BY created_at DESC LIMIT ?`;
  const deviceParams = filters?.customerCode
    ? [filters.customerCode.toUpperCase(), Math.min(limit, 50)]
    : [Math.min(limit, 50)];

  try {
    const deviceRows = db.prepare(deviceSql).all(...deviceParams) as Array<Record<string, unknown>>;
    for (const r of deviceRows) {
      events.push({
        id: String(r.id ?? `DEV-${r.device_id}-${r.created_at}`),
        category: "Device",
        title: String(r.title ?? r.event_type ?? "Device event"),
        detail: String(r.detail ?? ""),
        projectId: null,
        customerCode: r.customer_id != null ? String(r.customer_id) : null,
        createdAt: String(r.created_at),
        metadata: { deviceId: r.device_id },
      });
    }
  } catch {
    /* device_timeline may be empty */
  }

  try {
    const securityRows = db
      .prepare(
        `SELECT id, event_type, message, source, created_at, metadata_json
         FROM security_event_logs
         WHERE event_type LIKE 'switchbot_%' OR event_type IN ('auto_armed', 'auto_disarmed', 'auto_arm_blocked')
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(Math.min(limit, 30)) as Array<Record<string, unknown>>;
    for (const r of securityRows) {
      events.push({
        id: `SEC-${String(r.id)}`,
        category: "Alert",
        title: String(r.event_type),
        detail: String(r.message ?? ""),
        projectId: null,
        customerCode: filters?.customerCode?.toUpperCase() ?? null,
        createdAt: String(r.created_at),
        metadata: { source: r.source, security: true },
      });
    }
  } catch {
    /* security_event_logs optional */
  }

  try {
    const alertRows = db
      .prepare(
        `SELECT id, event_type, message, severity, created_at, customer_id, site_id
         FROM events ORDER BY created_at DESC LIMIT ?`
      )
      .all(Math.min(limit, 30)) as Array<Record<string, unknown>>;
    for (const r of alertRows) {
      const sev = String(r.severity ?? "");
      if (!["alarm", "warning", "critical"].includes(sev) && !String(r.event_type).includes("alert")) {
        continue;
      }
      events.push({
        id: `ALT-${String(r.id)}`,
        category: "Alert",
        title: String(r.event_type),
        detail: String(r.message ?? ""),
        projectId: null,
        customerCode: r.customer_id != null ? String(r.customer_id) : null,
        createdAt: String(r.created_at),
        metadata: { severity: sev, siteId: r.site_id },
      });
    }
  } catch {
    /* events table optional filter */
  }

  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return events.slice(0, limit);
}
