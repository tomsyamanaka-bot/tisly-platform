/**
 * お客様向け監視画面データ整形 — DOM 非依存
 */

import { buildMonitoringDashboardV1 } from "../../monitoring/tisly-monitoring-dashboard-v1.js";
import { listPropertyPortMappingsV1 } from "../../device/device-port-config-v1.js";
import { buildCustomerContactTelHrefV1 } from "./customer-project-actions-v1.js";
import { getPropertyByProjectRefV1 } from "./customer-property-master-v1.js";
import type { CustomerContactActionV1 } from "./customer-contact-settings-v1.js";
import type { CustomerContactV1 } from "./customer-view-model-v1.js";
import { resolveMonitoringSiteIdV1 } from "../../monitoring/tisly-monitoring-layout-v1.js";
import type { MonitoringDeviceStatusV1 } from "../../monitoring/tisly-monitoring-layout-v1.js";
import {
  CUSTOMER_CONTACT_LABEL_V1,
  CUSTOMER_MONITORING_LABELS_V1,
  CUSTOMER_SENSOR_STATUS_V1,
  CUSTOMER_SYSTEM_STATUS_V1,
  formatCustomerEventTimeV1,
  formatCustomerLastCheckedV1,
  type CustomerSystemStatusKeyV1,
} from "./customer-labels-v1.js";
import type {
  CustomerMonitoringAlertV1,
  CustomerMonitoringFloorV1,
  CustomerMonitoringLogV1,
  CustomerMonitoringViewV1,
} from "./customer-view-model-v1.js";

function mapSensorStatus(status: MonitoringDeviceStatusV1): string {
  return CUSTOMER_SENSOR_STATUS_V1[status] ?? CUSTOMER_SENSOR_STATUS_V1.offline;
}

function mapSystemStatus(
  hasAlert: boolean,
  hasWarning: boolean
): CustomerSystemStatusKeyV1 {
  if (hasAlert) return "alert";
  if (hasWarning) return "warning";
  return "normal";
}

function formatLogWhat(content: string, deviceName: string): string {
  const c = String(content ?? "").trim();
  if (!c || c === "通知イベント") return `${deviceName}で検知`;
  if (/通信断|通信遅延/.test(c)) {
    return "機器の通信状態を確認しています";
  }
  if (/deviceId|sensorId|topic|mqtt|statusCode|JSON/i.test(c)) {
    return "機器の状態を確認しています";
  }
  return c.replace(
    /\s+[—-]\s+[A-Z0-9][A-Z0-9_-]{3,}$/i,
    ""
  );
}

export function buildCustomerMonitoringDetailV1(
  shareId: string,
  propertyName: string,
  ref: string,
  contact?: CustomerContactV1,
  contactActions?: CustomerContactActionV1[]
): CustomerMonitoringViewV1 {
  const siteRef = ref.includes("-") ? ref.split("-").slice(0, 3).join("-") : ref;
  const siteId = resolveMonitoringSiteIdV1(siteRef);
  const dash = buildMonitoringDashboardV1(siteId);

  const floors: CustomerMonitoringFloorV1[] = dash.site.floors.map((floor) => ({
    floorId: floor.floorId,
    floorName: floor.floorName,
    sensors: floor.devices.map((d) => ({
      sensorId: d.deviceId,
      sensorName: d.deviceName,
      status: mapSensorStatus(d.status),
      statusKey: d.status,
      areaName: d.areaName,
      isCamera: d.deviceType === "camera",
    })),
  }));
  const property = getPropertyByProjectRefV1(ref);
  const mappedSensors = property
    ? listPropertyPortMappingsV1(property.propertyId).flatMap(
        (mapping) =>
          mapping.ports.map((port) => ({
            sensorId:
              `${mapping.deviceId}-${port.portType}${port.portNumber}`,
            sensorName: port.label,
            status: CUSTOMER_SENSOR_STATUS_V1.normal,
            statusKey: "normal" as const,
            areaName: "登録機器",
            isCamera: false,
          }))
      )
    : [];
  if (mappedSensors.length > 0) {
    floors.push({
      floorId: "registered-devices",
      floorName: "現場機器",
      sensors: mappedSensors,
    });
  }

  const hasAlert = floors.some((f) => f.sensors.some((s) => s.statusKey === "alert"));
  const hasWarning = floors.some((f) => f.sensors.some((s) => s.statusKey === "warning"));
  const systemKey = mapSystemStatus(hasAlert, hasWarning);
  const system = CUSTOMER_SYSTEM_STATUS_V1[systemKey];
  const visibleSensorIds = new Set(
    floors.flatMap((floor) =>
      floor.sensors.map((sensor) => sensor.sensorId)
    )
  );

  let activeAlert: CustomerMonitoringAlertV1 | null = null;
  if (dash.activeAlert) {
    const a = dash.activeAlert;
    activeAlert = {
      floorId: a.floorId,
      floorName: a.floorName,
      areaName: a.areaName,
      sensorName: a.deviceName,
      message: `${a.floorName}の${a.areaName}で警報を検知しました`,
      subMessage: "確認してください",
      timestamp: formatCustomerEventTimeV1(a.timestamp),
      highlightSensorId: visibleSensorIds.has(a.deviceId)
        ? a.deviceId
        : "unknown-sensor",
    };
  }

  const logs: CustomerMonitoringLogV1[] = dash.recentLogs.slice(0, 30).map((log) => ({
    id: log.id,
    time: formatCustomerEventTimeV1(log.timestamp),
    place: `${log.floorName} ${log.areaName}`.trim(),
    what: formatLogWhat(log.content, log.deviceName),
    isAlert: log.level === "侵入警報" || log.level === "警報",
  }));

  const alertLogs = logs.filter((l) => l.isAlert);
  const infoLogs = logs.filter((l) => !l.isAlert);

  const lastChecked = dash.recentLogs[0]?.timestamp ?? new Date().toISOString();

  const resolvedContact: CustomerContactV1 = contact ?? {
    companyName: "株式会社TOMS",
    phone: "048-594-7077",
  };
  const telHref = buildCustomerContactTelHrefV1(resolvedContact);

  return {
    shareId,
    propertyName,
    systemStatus: systemKey,
    systemStatusLabel: system.label,
    systemStatusEmoji: system.emoji,
    lastCheckedAt: formatCustomerLastCheckedV1(lastChecked),
    lastCheckedIso: lastChecked,
    floors,
    activeAlert,
    alertLogs,
    notificationLogs: infoLogs,
    allLogs: logs,
    noActiveIssues: !activeAlert,
    emptyMessage: CUSTOMER_MONITORING_LABELS_V1.allClear,
    lastDetectionLabel: CUSTOMER_MONITORING_LABELS_V1.lastDetection,
    sensorStatusLabel: CUSTOMER_MONITORING_LABELS_V1.sensorStatus,
    alertHistoryLabel: CUSTOMER_MONITORING_LABELS_V1.alertHistory,
    notificationHistoryLabel: CUSTOMER_MONITORING_LABELS_V1.notificationHistory,
    pageTitle: CUSTOMER_MONITORING_LABELS_V1.pageTitle,
    contactTelHref: telHref,
    contactLabel: CUSTOMER_CONTACT_LABEL_V1,
    contactActions: contactActions ?? [],
  };
}

/** API レスポンス用 — 技術フィールドを除去 */
export interface CustomerMonitoringApiV1 {
  propertyName: string;
  systemStatus: string;
  systemStatusLabel: string;
  systemStatusEmoji: string;
  lastCheckedAt: string;
  floors: Array<{
    floorId: string;
    floorName: string;
    sensors: Array<{
      sensorName: string;
      status: string;
      areaName: string;
      isCamera: boolean;
    }>;
  }>;
  activeAlert: {
    floorId: string;
    floorName: string;
    areaName: string;
    sensorName: string;
    message: string;
    subMessage: string;
    timestamp: string;
  } | null;
  alertLogs: CustomerMonitoringLogV1[];
  notificationLogs: CustomerMonitoringLogV1[];
  noActiveIssues: boolean;
  emptyMessage: string;
  lastDetectionLabel: string;
  sensorStatusLabel: string;
  alertHistoryLabel: string;
  notificationHistoryLabel: string;
  pageTitle: string;
  contactTelHref?: string;
  contactLabel?: string;
  contactActions?: Array<{ id: string; emoji: string; label: string; href: string }>;
}

export function sanitizeCustomerMonitoringApiV1(view: CustomerMonitoringViewV1): CustomerMonitoringApiV1 {
  return {
    propertyName: view.propertyName,
    systemStatus: view.systemStatus,
    systemStatusLabel: view.systemStatusLabel,
    systemStatusEmoji: view.systemStatusEmoji,
    lastCheckedAt: view.lastCheckedAt,
    floors: view.floors.map((f) => ({
      floorId: f.floorId,
      floorName: f.floorName,
      sensors: f.sensors.map((s) => ({
        sensorName: s.sensorName,
        status: s.status,
        areaName: s.areaName,
        isCamera: s.isCamera,
      })),
    })),
    activeAlert: view.activeAlert
      ? {
          floorId: view.activeAlert.floorId,
          floorName: view.activeAlert.floorName,
          areaName: view.activeAlert.areaName,
          sensorName: view.activeAlert.sensorName,
          message: view.activeAlert.message,
          subMessage: view.activeAlert.subMessage,
          timestamp: view.activeAlert.timestamp,
        }
      : null,
    alertLogs: view.alertLogs,
    notificationLogs: view.notificationLogs,
    noActiveIssues: view.noActiveIssues,
    emptyMessage: view.emptyMessage,
    lastDetectionLabel: view.lastDetectionLabel,
    sensorStatusLabel: view.sensorStatusLabel,
    alertHistoryLabel: view.alertHistoryLabel,
    notificationHistoryLabel: view.notificationHistoryLabel,
    pageTitle: view.pageTitle,
    contactTelHref: view.contactTelHref,
    contactLabel: view.contactLabel,
    contactActions: view.contactActions,
  };
}
