/** 案件ダッシュボード v1 — KPI・今日の予定・要対応・集計 */

import { getDatabase } from "../db/database.js";
import { getScheduleDayDetail } from "../schedule/schedule-store.js";
import {
  extractEventAddress,
  extractEventDisplayTitle,
  resolveEventProjectRef,
} from "../schedule/address-extract-service.js";
import type { ScheduleEvent } from "../schedule/schedule-types.js";
import { todayInTimeZone } from "../services/googleCalendar.js";
import { getStorageSettingsV1 } from "../storage/storage-settings-store.js";
import {
  isQnapPdfBackupConfigured,
  listProjectPdfMeta,
} from "./project-pdf-qnap-store.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";
import {
  deriveProjectStatusFromRowV1,
  PROJECT_MGMT_STATUS_LABELS,
  type ProjectMgmtStatus,
} from "./project-mgmt-status-v1.js";
import { PROJECT_STATUS_COLOR_GROUP_V1 } from "./project-status-v1.js";
import { listProjectCityCodesV1, resolveCityCodeForProject } from "./project-id-v1.js";
import { getProjectAutomationBundleV1 } from "./project-automation-v1-store.js";
import { listAiSuggestionsV1 } from "./project-automation-suggestions-v1.js";
import type { ProjectMgmtListItemV1 } from "./project-mgmt-v1-store.js";

export interface DashboardKpiCardV1 {
  key: string;
  label: string;
  count: number;
}

export interface DashboardSummaryV1 {
  total: number;
  cards: DashboardKpiCardV1[];
}

export interface DashboardTodayItemV1 {
  eventId: string;
  timeLabel: string;
  title: string;
  rawTitle: string;
  address: string;
  assignee: string;
  projectId: string | null;
  projectNo: string | null;
  detailHref: string | null;
  linked: boolean;
}

export interface DashboardTodayV1 {
  date: string;
  items: DashboardTodayItemV1[];
}

export type DashboardAlertType =
  | "survey_overdue"
  | "estimate_not_submitted"
  | "invoice_not_issued"
  | "payment_pending"
  | "pdf_not_saved"
  | "qnap_not_saved"
  | "photos_missing"
  | "completion_photos_missing";

export type DashboardAlertPriority = "red" | "yellow" | "blue";

export interface DashboardAlertV1 {
  projectId: string;
  projectNo: string;
  customerName: string;
  title: string;
  assignee: string;
  mgmtStatus: ProjectMgmtStatus;
  mgmtStatusLabel: string;
  alertType: DashboardAlertType;
  alertLabel: string;
  priority: DashboardAlertPriority;
  priorityOrder: number;
  detail: string;
  updatedAt: string;
}

export interface DashboardRecentItemV1 {
  id: string;
  projectNo: string;
  customerName: string;
  title: string;
  mgmtStatus: ProjectMgmtStatus;
  mgmtStatusLabel: string;
  updatedAt: string;
  templateName: string | null;
  automation: {
    tasksDone: number;
    tasksTotal: number;
    tasksPercent: number;
    toolsChecked: number;
    toolsTotal: number;
    toolsPercent: number;
    photosShot: number;
    photosTotal: number;
    photosPercent: number;
    documentsPercent: number;
    qnapPending: number;
  } | null;
  suggestions: Array<{ id: string; label: string }>;
}

export interface DashboardCityStatV1 {
  cityCode: string;
  cityName: string;
  count: number;
}

export interface DashboardSalesV1 {
  monthLabel: string;
  estimateTotal: number;
  invoiceTotal: number;
  paidTotal: number;
}

export interface DashboardOperationalKpiCardV1 {
  key: string;
  label: string;
  value: number;
  format: "count" | "yen" | "percent";
}

export interface DashboardOperationalKpiV1 {
  cards: DashboardOperationalKpiCardV1[];
  weekLabel: string;
  monthLabel: string;
}

function weekBoundsJst(now = new Date()): { start: string; end: string; label: string } {
  const d = new Date(now);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  const fmt = (x: Date) =>
    `${x.getMonth() + 1}/${x.getDate()}`;
  return {
    start: mon.toISOString(),
    end: sun.toISOString(),
    label: `${fmt(mon)}–${fmt(sun)}`,
  };
}

function sumInvoicesBetween(start: string, end: string): number {
  const row = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(i.total), 0) AS total
       FROM business_invoices i
       INNER JOIN business_projects p ON p.id = i.project_id
       WHERE p.deleted_at IS NULL
         AND i.created_at >= ? AND i.created_at <= ?`
    )
    .get(start, end) as { total: number };
  return Number(row?.total ?? 0);
}

export function getDashboardOperationalKpiV1(now = new Date()): DashboardOperationalKpiV1 {
  const rows = listActiveProjectRows();
  let inProgress = 0;
  let estimateWaiting = 0;
  let invoiceWaiting = 0;
  let incomplete = 0;

  for (const row of rows) {
    const mgmt = deriveRowMgmt(row);
    if (mgmt !== "completed") incomplete += 1;
    if (
      mgmt !== "completed" &&
      mgmt !== "invoiced" &&
      mgmt !== "awaiting_payment"
    ) {
      inProgress += 1;
    }
    if (
      mgmt === "survey_done" ||
      mgmt === "estimate_creating" ||
      (mgmt === "survey_scheduled" && !row.estimate_id)
    ) {
      estimateWaiting += 1;
    }
    if (mgmt === "awaiting_invoice" || (mgmt === "completion_report_creating" && !row.invoice_id)) {
      invoiceWaiting += 1;
    }
  }

  const week = weekBoundsJst(now);
  const month = monthBoundsJst(now);
  const weekSales = sumInvoicesBetween(week.start, week.end);
  const monthSales = sumInvoicesBetween(month.start, month.end);
  const grossProfitEstimate = Math.round(monthSales * 0.3);

  return {
    weekLabel: week.label,
    monthLabel: month.label,
    cards: [
      { key: "in_progress", label: "進行中案件", value: inProgress, format: "count" },
      { key: "estimate_waiting", label: "見積待ち", value: estimateWaiting, format: "count" },
      { key: "invoice_waiting", label: "請求待ち", value: invoiceWaiting, format: "count" },
      { key: "incomplete", label: "未完了案件", value: incomplete, format: "count" },
      { key: "week_sales", label: "今週売上", value: weekSales, format: "yen" },
      { key: "month_sales", label: "今月売上", value: monthSales, format: "yen" },
      { key: "gross_profit", label: "粗利（仮）", value: grossProfitEstimate, format: "yen" },
    ],
  };
}

type ProjectRow = Record<string, unknown>;

const DASHBOARD_RETURN = encodeURIComponent("/project-dashboard-v1");

function projectDetailHref(projectId: string): string {
  return `/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&return=${DASHBOARD_RETURN}`;
}

const KPI_DEFS: Array<{ key: string; label: string; statuses: ProjectMgmtStatus[] }> = [
  { key: "inquiry", label: "問い合わせ", statuses: ["inquiry"] },
  { key: "estimate_submitted", label: "見積提出済", statuses: ["estimate_submitted"] },
  { key: "ordered", label: "受注", statuses: ["ordered"] },
  { key: "construction_in_progress", label: "施工中", statuses: ["construction_in_progress"] },
  {
    key: "awaiting_invoice",
    label: "請求待ち",
    statuses: ["awaiting_invoice", "completion_report_creating"],
  },
  { key: "awaiting_payment", label: "入金待ち", statuses: ["awaiting_payment", "invoiced"] },
  { key: "completed", label: "完了", statuses: ["completed"] },
];

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function monthBoundsJst(now = new Date()): { start: string; end: string; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).toISOString();
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999).toISOString();
  return { start, end, label: `${y}年${m + 1}月` };
}

function listActiveProjectRows(): ProjectRow[] {
  return getDatabase()
    .prepare(
      `SELECT id, project_no, title, customer_name, address, municipality, assignee, phone,
              status, invoice_id, paid_date, estimate_id, survey_project_id,
              survey_schedule_json, construction_schedule_json,
              payment_due_date, created_at, updated_at
       FROM business_projects
       WHERE deleted_at IS NULL`
    )
    .all() as ProjectRow[];
}

function deriveRowMgmt(row: ProjectRow): ProjectMgmtStatus {
  return deriveProjectStatusFromRowV1(row);
}

function rowToListItem(row: ProjectRow): ProjectMgmtListItemV1 {
  const mgmtStatus = deriveRowMgmt(row);
  return {
    id: String(row.id),
    projectNo: String(row.project_no ?? row.id),
    title: String(row.title ?? ""),
    customerName: String(row.customer_name ?? ""),
    address: String(row.address ?? ""),
    municipality: String(row.municipality ?? ""),
    assignee: String(row.assignee ?? ""),
    mgmtStatus,
    mgmtStatusLabel: PROJECT_MGMT_STATUS_LABELS[mgmtStatus],
    statusColor: PROJECT_STATUS_COLOR_GROUP_V1[mgmtStatus],
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function surveyScheduleDate(row: ProjectRow): string | null {
  const schedule = parseJson<{ date?: string } | null>(row.survey_schedule_json, null);
  const date = schedule?.date?.trim();
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}


function formatTimeLabel(event: ScheduleEvent): string {
  if (event.allDay) return "終日";
  const start = event.startTime?.trim();
  const end = event.endTime?.trim();
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return "—";
}

function loadBusinessProjectMeta(projectId: string): {
  projectNo: string;
  assignee: string;
  address: string;
  customerName: string;
} | null {
  const row = getDatabase()
    .prepare(
      `SELECT project_no, assignee, address, customer_name
       FROM business_projects WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId) as ProjectRow | undefined;
  if (!row) return null;
  return {
    projectNo: String(row.project_no ?? projectId),
    assignee: String(row.assignee ?? ""),
    address: String(row.address ?? ""),
    customerName: String(row.customer_name ?? ""),
  };
}

function resolveBusinessProjectId(ref: { projectSource: string; projectId: string }): string | null {
  if (ref.projectSource === "business") return ref.projectId;
  const row = getDatabase()
    .prepare(
      `SELECT id FROM business_projects
       WHERE survey_project_id = ? AND deleted_at IS NULL
       LIMIT 1`
    )
    .get(ref.projectId) as { id?: string } | undefined;
  return row?.id ? String(row.id) : null;
}

export function getDashboardSummaryV1(): DashboardSummaryV1 {
  const rows = listActiveProjectRows();
  const counts = new Map<string, number>();
  for (const def of KPI_DEFS) counts.set(def.key, 0);

  for (const row of rows) {
    const mgmt = deriveRowMgmt(row);
    for (const def of KPI_DEFS) {
      if (def.statuses.includes(mgmt)) {
        counts.set(def.key, (counts.get(def.key) ?? 0) + 1);
        break;
      }
    }
  }

  const cards: DashboardKpiCardV1[] = [
    { key: "total", label: "案件総数", count: rows.length },
    ...KPI_DEFS.map((def) => ({
      key: def.key,
      label: def.label,
      count: counts.get(def.key) ?? 0,
    })),
  ];

  return { total: rows.length, cards };
}

export async function getDashboardTodayV1(dateRaw?: string): Promise<DashboardTodayV1> {
  const date = (dateRaw ?? todayInTimeZone()).slice(0, 10);
  const detail = await getScheduleDayDetail(date);
  const events = [...(detail?.day.events ?? [])].sort((a, b) => {
    const sa = a.startTime ?? "";
    const sb = b.startTime ?? "";
    if (sa !== sb) return sa.localeCompare(sb, "ja");
    return a.title.localeCompare(b.title, "ja");
  });

  const items: DashboardTodayItemV1[] = events.map((event) => {
    const ref = resolveEventProjectRef(event);
    let projectId: string | null = null;
    let projectNo: string | null = null;
    let assignee = "";

    if (ref) {
      projectId = resolveBusinessProjectId(ref);
      if (projectId) {
        const meta = loadBusinessProjectMeta(projectId);
        if (meta) {
          projectNo = meta.projectNo;
          assignee = meta.assignee;
        }
      }
    }

    const extracted = extractEventAddress(event);
    let address = extracted.fullAddress?.trim() || extracted.displayAddress?.trim() || "";
    if (!address || address === "住所未確定" || address === "住所未設定") {
      if (projectId) {
        const meta = loadBusinessProjectMeta(projectId);
        if (meta?.address?.trim()) address = meta.address.trim();
      }
    }
    if (!address || address === "住所未確定") address = "住所未設定";

    const displayTitle = extractEventDisplayTitle(event);
    const linked = Boolean(projectId);

    return {
      eventId: event.id,
      timeLabel: formatTimeLabel(event),
      title: displayTitle,
      rawTitle: event.title,
      address,
      assignee,
      projectId,
      projectNo,
      detailHref: projectId ? projectDetailHref(projectId) : null,
      linked,
    };
  });

  return { date, items };
}

function pushDashboardAlert(
  alerts: DashboardAlertV1[],
  base: ProjectMgmtListItemV1,
  spec: {
    alertType: DashboardAlertType;
    alertLabel: string;
    priority: DashboardAlertPriority;
    priorityOrder: number;
    detail: string;
  }
): void {
  alerts.push({
    projectId: base.id,
    projectNo: base.projectNo,
    customerName: base.customerName,
    title: base.title,
    assignee: base.assignee,
    mgmtStatus: base.mgmtStatus,
    mgmtStatusLabel: base.mgmtStatusLabel,
    updatedAt: base.updatedAt,
    ...spec,
  });
}

function collectDocumentAlerts(projectId: string): Array<{
  alertType: DashboardAlertType;
  alertLabel: string;
  priority: DashboardAlertPriority;
  priorityOrder: number;
  detail: string;
}> {
  const out: Array<{
    alertType: DashboardAlertType;
    alertLabel: string;
    priority: DashboardAlertPriority;
    priorityOrder: number;
    detail: string;
  }> = [];
  const docStatus = getProjectDocumentsStatusV1(projectId);
  if (!docStatus) return out;
  const docs = docStatus.documents;

  for (const doc of docs) {
    if (doc.status === "photos_missing") {
      out.push({
        alertType: "photos_missing",
        alertLabel: "写真不足",
        priority: "yellow",
        priorityOrder: 5,
        detail: `${doc.label}用の現調写真`,
      });
      continue;
    }
    if (doc.status === "completion_photos_missing") {
      out.push({
        alertType: "completion_photos_missing",
        alertLabel: "完了写真不足",
        priority: "yellow",
        priorityOrder: 6,
        detail: doc.label,
      });
      continue;
    }
    if (!doc.hasPdf && doc.status === "stale") {
      out.push({
        alertType: "pdf_not_saved",
        alertLabel: "PDF未保存",
        priority: "yellow",
        priorityOrder: 7,
        detail: doc.label,
      });
      continue;
    }
    if (doc.status === "not_created" && doc.kind === "estimate") {
      const project = getDatabase()
        .prepare(`SELECT estimate_id FROM business_projects WHERE id = ?`)
        .get(projectId) as { estimate_id?: string } | undefined;
      if (project?.estimate_id) {
        out.push({
          alertType: "pdf_not_saved",
          alertLabel: "PDF未保存",
          priority: "yellow",
          priorityOrder: 7,
          detail: doc.label,
        });
      }
    } else if (doc.status === "not_created" && doc.kind === "invoice") {
      const project = getDatabase()
        .prepare(`SELECT invoice_id FROM business_projects WHERE id = ?`)
        .get(projectId) as { invoice_id?: string } | undefined;
      if (project?.invoice_id) {
        out.push({
          alertType: "pdf_not_saved",
          alertLabel: "PDF未保存",
          priority: "yellow",
          priorityOrder: 7,
          detail: doc.label,
        });
      }
    }
  }

  const settings = getStorageSettingsV1();
  const qnapEnabled = Boolean(settings.qnapBackupEnabled && isQnapPdfBackupConfigured());
  if (qnapEnabled) {
    for (const meta of listProjectPdfMeta(projectId)) {
      if (meta.qnapBackupEnabled && meta.localPath && meta.qnapBackupStatus !== "success") {
        out.push({
          alertType: "qnap_not_saved",
          alertLabel: "QNAP未保存",
          priority: "blue",
          priorityOrder: 8,
          detail: meta.fileName,
        });
      }
    }
  }

  return out;
}

export function getDashboardAlertsV1(todayRaw?: string): DashboardAlertV1[] {
  const today = (todayRaw ?? todayInTimeZone()).slice(0, 10);
  const rows = listActiveProjectRows();
  const alerts: DashboardAlertV1[] = [];

  for (const row of rows) {
    const base = rowToListItem(row);
    const mgmt = base.mgmtStatus;
    const surveyDate = surveyScheduleDate(row);

    if (
      (mgmt === "survey_scheduled" || mgmt === "inquiry") &&
      surveyDate &&
      surveyDate < today
    ) {
      pushDashboardAlert(alerts, base, {
        alertType: "survey_overdue",
        alertLabel: "現調予定日超過",
        priority: "red",
        priorityOrder: 1,
        detail: `現調予定 ${surveyDate}`,
      });
    }

    const status = String(row.status ?? "new").toLowerCase();
    const hasEstimate = Boolean(row.estimate_id);
    if (
      !hasEstimate &&
      (status === "survey_done" ||
        (mgmt === "survey_scheduled" && surveyDate && surveyDate < today))
    ) {
      pushDashboardAlert(alerts, base, {
        alertType: "estimate_not_submitted",
        alertLabel: "見積未提出",
        priority: "yellow",
        priorityOrder: 2,
        detail: surveyDate ? `現調日 ${surveyDate}` : "見積書未作成",
      });
    }

    if (mgmt === "awaiting_invoice" && !row.invoice_id) {
      pushDashboardAlert(alerts, base, {
        alertType: "invoice_not_issued",
        alertLabel: "請求未発行",
        priority: "yellow",
        priorityOrder: 3,
        detail: "工事完了・請求書未発行",
      });
    }

    if ((mgmt === "invoiced" || mgmt === "awaiting_payment") && !row.paid_date) {
      pushDashboardAlert(alerts, base, {
        alertType: "payment_pending",
        alertLabel: "入金待ち",
        priority: "blue",
        priorityOrder: 4,
        detail: "請求済・未入金",
      });
    }

    for (const docAlert of collectDocumentAlerts(base.id)) {
      pushDashboardAlert(alerts, base, docAlert);
    }
  }

  return alerts.sort((a, b) => {
    if (a.priorityOrder !== b.priorityOrder) return a.priorityOrder - b.priorityOrder;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function getDashboardRecentV1(limit = 10): DashboardRecentItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, project_no, customer_name, status, invoice_id, paid_date, estimate_id,
              survey_project_id, survey_schedule_json, construction_schedule_json, updated_at
       FROM business_projects
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(limit) as ProjectRow[];

  return rows.map((row) => {
    const item = rowToListItem(row);
    const projectId = item.id;
    let automation: DashboardRecentItemV1["automation"] = null;
    let templateName: string | null = null;
    let suggestions: DashboardRecentItemV1["suggestions"] = [];
    try {
      const bundle = getProjectAutomationBundleV1(projectId);
      templateName = bundle.templateName;
      if (bundle.tasks.length > 0 || bundle.tools.length > 0 || bundle.photos.length > 0) {
        let qnapPending = 0;
        const docMeta = listProjectPdfMeta(projectId);
        for (const meta of docMeta) {
          if (meta.qnapBackupEnabled && meta.localPath && meta.qnapBackupStatus !== "success") {
            qnapPending += 1;
          }
        }
        automation = {
          tasksDone: bundle.progress.tasks.done,
          tasksTotal: bundle.progress.tasks.total,
          tasksPercent: bundle.progress.tasks.percent,
          toolsChecked: bundle.progress.tools.checked,
          toolsTotal: bundle.progress.tools.total,
          toolsPercent: bundle.progress.tools.percent,
          photosShot: bundle.progress.photos.shot,
          photosTotal: bundle.progress.photos.total,
          photosPercent: bundle.progress.photos.percent,
          documentsPercent: bundle.progress.documents.percent,
          qnapPending,
        };
      }
      suggestions = listAiSuggestionsV1(projectId)
        .slice(0, 3)
        .map((s) => ({ id: s.id, label: s.label }));
    } catch {
      /* optional */
    }
    return {
      id: item.id,
      projectNo: item.projectNo,
      customerName: item.customerName,
      title: item.title,
      mgmtStatus: item.mgmtStatus,
      mgmtStatusLabel: item.mgmtStatusLabel,
      updatedAt: item.updatedAt,
      templateName,
      automation,
      suggestions,
    };
  });
}

export function getDashboardCityStatsV1(): DashboardCityStatV1[] {
  const cities = listProjectCityCodesV1();
  const counts = new Map(cities.map((c) => [c.cityCode, 0]));
  const rows = listActiveProjectRows();

  for (const row of rows) {
    const projectNo = String(row.project_no ?? "");
    const prefix = projectNo.split("-")[0]?.toUpperCase();
    let code = prefix && counts.has(prefix) ? prefix : null;
    if (!code) {
      code = resolveCityCodeForProject({
        municipality: String(row.municipality ?? ""),
        address: String(row.address ?? ""),
      });
    }
    if (counts.has(code)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return cities.map((c) => ({
    cityCode: c.cityCode,
    cityName: c.cityName,
    count: counts.get(c.cityCode) ?? 0,
  }));
}

export function getDashboardSalesV1(now = new Date()): DashboardSalesV1 {
  const { start, end, label } = monthBoundsJst(now);
  const db = getDatabase();

  const estimateRow = db
    .prepare(
      `SELECT COALESCE(SUM(e.total), 0) AS total
       FROM business_estimates e
       INNER JOIN business_projects p ON p.id = e.project_id
       WHERE p.deleted_at IS NULL
         AND e.created_at >= ? AND e.created_at <= ?`
    )
    .get(start, end) as { total: number };

  const invoiceRow = db
    .prepare(
      `SELECT COALESCE(SUM(i.total), 0) AS total
       FROM business_invoices i
       INNER JOIN business_projects p ON p.id = i.project_id
       WHERE p.deleted_at IS NULL
         AND i.created_at >= ? AND i.created_at <= ?`
    )
    .get(start, end) as { total: number };

  const paidRow = db
    .prepare(
      `SELECT COALESCE(SUM(i.total), 0) AS total
       FROM business_projects p
       INNER JOIN business_invoices i ON i.id = p.invoice_id
       WHERE p.deleted_at IS NULL
         AND p.paid_date IS NOT NULL
         AND p.paid_date >= ? AND p.paid_date <= ?`
    )
    .get(start, end) as { total: number };

  return {
    monthLabel: label,
    estimateTotal: Number(estimateRow?.total ?? 0),
    invoiceTotal: Number(invoiceRow?.total ?? 0),
    paidTotal: Number(paidRow?.total ?? 0),
  };
}

export function searchDashboardProjectsV1(q: string, limit = 50): ProjectMgmtListItemV1[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  const rows = getDatabase()
    .prepare(
      `SELECT id, project_no, title, customer_name, address, municipality, assignee, phone,
              status, invoice_id, paid_date, estimate_id, survey_project_id,
              survey_schedule_json, construction_schedule_json, created_at, updated_at
       FROM business_projects
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 500`
    )
    .all() as ProjectRow[];

  return rows
    .filter((row) => {
      const fields = [
        String(row.project_no ?? ""),
        String(row.customer_name ?? ""),
        String(row.phone ?? ""),
        String(row.address ?? ""),
        String(row.municipality ?? ""),
        String(row.assignee ?? ""),
        String(row.title ?? ""),
      ];
      return fields.some((f) => f.toLowerCase().includes(needle));
    })
    .slice(0, limit)
    .map(rowToListItem);
}
