/** TiSLY Monitoring 3D Dashboard V1 — ログ正規化 · ダッシュボード API ロジック */

import { getDatabase } from "../db/database.js";
import {
  findMonitoringDeviceV1,
  findMonitoringFloorForDeviceV1,
  getMonitoringLayoutSiteV1,
  guessDeviceNameFromIdV1,
  resolveMonitoringSiteIdV1,
  type MonitoringLayoutSiteV1,
} from "./tisly-monitoring-layout-v1.js";

export type MonitoringLogLevelJaV1 = "侵入警報" | "警報" | "情報";

export interface MonitoringLogEntryV1 {
  id: string;
  timestamp: string;
  level: MonitoringLogLevelJaV1;
  levelRaw: string;
  floorId: string | null;
  floorName: string;
  areaName: string;
  deviceId: string;
  deviceName: string;
  content: string;
  status: "open" | "acked";
  eventType: string;
  source: "event" | "notification";
}

export interface MonitoringActiveAlertV1 {
  id: string;
  floorId: string;
  floorName: string;
  areaName: string;
  deviceId: string;
  deviceName: string;
  level: MonitoringLogLevelJaV1;
  content: string;
  headline: string;
  timestamp: string;
  linkedCameraId: string | null;
  linkedKnowledgeIds: string[];
}

export interface MonitoringDashboardPayloadV1 {
  site: MonitoringLayoutSiteV1;
  activeAlert: MonitoringActiveAlertV1 | null;
  recentLogs: MonitoringLogEntryV1[];
  stats: {
    alertCount: number;
    warningCount: number;
    infoCount: number;
    ackedCount: number;
  };
}

const ackedIds = new Set<string>();

export function clearMonitoringAcksForTestV1(): void {
  ackedIds.clear();
}

export function normalizeMonitoringLevelJaV1(
  severity: string | null | undefined,
  eventType?: string | null
): MonitoringLogLevelJaV1 {
  const s = (severity ?? "info").toLowerCase();
  const et = (eventType ?? "").toLowerCase();
  if (s === "critical" || s === "alarm" || s === "alert" || et === "intrusion" || et === "estop") {
    return "侵入警報";
  }
  if (s === "warning") return "警報";
  return "情報";
}

export function normalizeMonitoringContentV1(
  message: string | null | undefined,
  title: string | null | undefined,
  eventType: string | null | undefined
): string {
  const raw = (message ?? title ?? "").trim();
  const et = (eventType ?? "").trim().toLowerCase();
  if (!raw || raw.toUpperCase() === "UNKNOWN" || raw === et) {
    const map: Record<string, string> = {
      intrusion: "侵入検知",
      motion: "動体検知",
      camera_motion: "カメラ動体検知",
      door_open: "ドア開",
      window_open: "窓開放検知",
      perimeter: "外周検知",
      heartbeat: "ハートビート",
      recovery: "復旧",
      estop: "非常停止",
      event: "通知イベント",
    };
    return map[et] ?? (et ? `${et}イベント` : "通知イベント");
  }
  if (raw.toUpperCase() === "EVENT") return "通知イベント";
  return raw;
}

function resolveDeviceDisplayV1(
  siteId: string,
  deviceId: string | null | undefined,
  zone: string | null | undefined
): { deviceName: string; floorId: string | null; floorName: string; areaName: string } {
  const dev = findMonitoringDeviceV1(siteId, deviceId ?? undefined);
  const floor = findMonitoringFloorForDeviceV1(siteId, deviceId ?? undefined);
  if (dev) {
    return {
      deviceName: dev.deviceName,
      floorId: floor?.floorId ?? null,
      floorName: floor?.floorName ?? "—",
      areaName: dev.areaName,
    };
  }
  const zoneName = (zone ?? "").trim();
  const floorGuess =
    zoneName.includes("外周") || zoneName.includes("駐車")
      ? "外周"
      : zoneName.includes("2") || zoneName.includes("2F") || zoneName.includes("2階")
        ? "2階"
        : zoneName.includes("1") || zoneName.includes("1F") || zoneName.includes("1階") || zoneName.includes("玄関")
          ? "1階"
          : "—";
  return {
    deviceName: deviceId ? guessDeviceNameFromIdV1(deviceId) : "未登録機器",
    floorId: null,
    floorName: floorGuess,
    areaName: zoneName || "—",
  };
}

function rowToLogEntryV1(
  siteId: string,
  row: {
    id: string;
    created_at: string;
    severity?: string | null;
    event_type?: string | null;
    message?: string | null;
    title?: string | null;
    device_id?: string | null;
    zone?: string | null;
  },
  source: "event" | "notification"
): MonitoringLogEntryV1 {
  const deviceId = row.device_id ?? "unknown";
  const resolved = resolveDeviceDisplayV1(siteId, deviceId, row.zone ?? null);
  const level = normalizeMonitoringLevelJaV1(row.severity, row.event_type);
  return {
    id: `${source}:${row.id}`,
    timestamp: row.created_at,
    level,
    levelRaw: (row.severity ?? "info").toLowerCase(),
    floorId: resolved.floorId,
    floorName: resolved.floorName,
    areaName: resolved.areaName,
    deviceId,
    deviceName: resolved.deviceName,
    content: normalizeMonitoringContentV1(row.message, row.title, row.event_type),
    status: ackedIds.has(`${source}:${row.id}`) ? "acked" : "open",
    eventType: row.event_type ?? "event",
    source,
  };
}

export function listMonitoringLogsV1(
  siteIdInput?: string | null,
  filter: "all" | "alarm" | "info" | "acked" = "all",
  limit = 80
): MonitoringLogEntryV1[] {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const db = getDatabase();
  const eventRows = db
    .prepare(
      `SELECT id, created_at, severity, event_type, message, title, device_id, zone
       FROM events ORDER BY created_at DESC LIMIT ?`
    )
    .all(Math.min(limit, 120)) as Array<{
    id: string;
    created_at: string;
    severity: string;
    event_type: string;
    message: string | null;
    title: string | null;
    device_id: string;
    zone: string | null;
  }>;

  const notifRows = db
    .prepare(
      `SELECT id, created_at, event_type, title, body AS message, '' AS severity, '' AS device_id, '' AS zone
       FROM notification_logs ORDER BY created_at DESC LIMIT ?`
    )
    .all(Math.min(limit, 80)) as Array<{
    id: string;
    created_at: string;
    event_type: string;
    title: string | null;
    message: string | null;
  }>;

  const merged = [
    ...eventRows.map((r) => rowToLogEntryV1(siteId, r, "event")),
    ...notifRows.map((r) =>
      rowToLogEntryV1(
        siteId,
        {
          ...r,
          severity: r.event_type?.includes("alarm") || r.event_type?.includes("intrusion") ? "alarm" : "info",
          device_id: null,
        },
        "notification"
      )
    ),
  ]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit);

  return merged.filter((log) => {
    if (filter === "alarm") return log.level === "侵入警報" || log.level === "警報";
    if (filter === "info") return log.level === "情報";
    if (filter === "acked") return log.status === "acked";
    return true;
  });
}

function buildHeadlineV1(log: MonitoringLogEntryV1): string {
  return `${log.floorName} ${log.areaName}：${log.content}`;
}

export function buildMonitoringActiveAlertV1(
  siteIdInput?: string | null
): MonitoringActiveAlertV1 | null {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const logs = listMonitoringLogsV1(siteId, "all", 30);
  const hit = logs.find(
    (l) => l.status === "open" && (l.level === "侵入警報" || l.level === "警報")
  );
  if (!hit) return null;
  const dev = findMonitoringDeviceV1(siteId, hit.deviceId);
  return {
    id: hit.id,
    floorId: hit.floorId ?? findMonitoringFloorForDeviceV1(siteId, hit.deviceId)?.floorId ?? "1f",
    floorName: hit.floorName,
    areaName: hit.areaName,
    deviceId: hit.deviceId,
    deviceName: hit.deviceName,
    level: hit.level,
    content: hit.content,
    headline: buildHeadlineV1(hit),
    timestamp: hit.timestamp,
    linkedCameraId: dev?.linkedCameraId ?? (dev?.deviceType === "camera" ? dev.deviceId : null),
    linkedKnowledgeIds: dev?.linkedKnowledgeIds ?? [],
  };
}

export function buildMonitoringDashboardV1(siteIdInput?: string | null): MonitoringDashboardPayloadV1 {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const site = getMonitoringLayoutSiteV1(siteId);
  const recentLogs = listMonitoringLogsV1(siteId, "all", 50);
  const activeAlert = buildMonitoringActiveAlertV1(siteId);
  return {
    site,
    activeAlert,
    recentLogs,
    stats: {
      alertCount: recentLogs.filter((l) => l.level === "侵入警報").length,
      warningCount: recentLogs.filter((l) => l.level === "警報").length,
      infoCount: recentLogs.filter((l) => l.level === "情報").length,
      ackedCount: recentLogs.filter((l) => l.status === "acked").length,
    },
  };
}

export function ackMonitoringLogV1(logId: string): boolean {
  if (!logId) return false;
  ackedIds.add(logId);
  return true;
}

export function buildMonitoringCustomerLinksV1(
  siteId: string,
  deviceId: string
): { equipmentUrl: string; materialsUrl: string; projectUrl: string } {
  const site = getMonitoringLayoutSiteV1(siteId);
  const dev = findMonitoringDeviceV1(siteId, deviceId);
  const ref = site.customerRef;
  const kid = dev?.linkedKnowledgeIds?.[0];
  return {
    projectUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(ref)}`,
    equipmentUrl: kid
      ? `/knowledge-customer-detail-v1?id=${encodeURIComponent(kid)}&kind=card`
      : `/knowledge-customer-site-map-v1?ref=${encodeURIComponent(ref)}`,
    materialsUrl: `/knowledge-customer-document-v1?ref=${encodeURIComponent(ref)}&fileId=spec-pdf-001`,
  };
}
