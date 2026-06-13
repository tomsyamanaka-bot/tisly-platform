/** 案件一覧 PWA v1 — business + survey 統合表示（Field Operations UI v2 パイプライン） */

import { getDatabase } from "../db/database.js";
import { listProjectTimeline } from "../toms/project-timeline.js";
import type {
  CompletionChecklistItemV1,
  ProjectRefV1,
  WorkSessionV1,
} from "../field-ops/field-ops-types.js";
import {
  getLatestWorkSessionForProject,
  listCompletionChecklistV1,
} from "../field-ops/work-session-v1-store.js";
import { getFieldCheckProgressV1 } from "../field-ops/field-check-v1-store.js";
import { countExistingProjectPdfsV1 } from "./project-pdf-store.js";

export type ProjectPipelineStage =
  | "survey"
  | "estimate"
  | "ordered"
  | "field_check"
  | "purchase"
  | "construction"
  | "work_done"
  | "invoice"
  | "payment";

export const PIPELINE_STAGE_LABELS: Record<ProjectPipelineStage, string> = {
  survey: "現調",
  estimate: "見積",
  ordered: "受注",
  field_check: "材料チェック",
  purchase: "発注",
  construction: "施工中",
  work_done: "完了",
  invoice: "請求",
  payment: "入金",
};

export const PIPELINE_STAGE_ORDER: ProjectPipelineStage[] = [
  "survey",
  "estimate",
  "ordered",
  "field_check",
  "purchase",
  "construction",
  "work_done",
  "invoice",
  "payment",
];

export type PipelineStageState = "pending" | "active" | "done";

export interface ProjectListItemV1 {
  id: string;
  projectNo: string;
  title: string;
  customerName: string;
  address: string;
  status: string;
  statusLabel: string;
  pipeline: Record<ProjectPipelineStage, PipelineStageState>;
  source: "business" | "survey";
  updatedAt: string;
  hasEstimate?: boolean;
  hasInvoice?: boolean;
}

export interface ProjectTimelineItemV1 {
  date: string;
  label: string;
  detail: string;
}

export interface ProjectDetailV1 {
  project: ProjectListItemV1;
  timeline: ProjectTimelineItemV1[];
  phone: string | null;
  assignee: string | null;
  workSession: WorkSessionV1 | null;
  completionChecklist: CompletionChecklistItemV1[];
}

const STATUS_LABELS: Record<string, string> = {
  new: "新規",
  survey_scheduled: "現調予定",
  survey_done: "現調済",
  estimate_created: "見積作成",
  estimate_sent: "見積送付",
  construction_scheduled: "施工予定",
  construction_done: "施工完了",
  invoiced: "請求済",
  paid: "入金済",
  closed: "完了",
  surveying: "現調中",
  estimate_pending: "見積待ち",
  estimate_done: "見積済",
  ordered: "受注",
  completed: "完了",
};

function emptyPipeline(): ProjectListItemV1["pipeline"] {
  return {
    survey: "pending",
    estimate: "pending",
    ordered: "pending",
    field_check: "pending",
    purchase: "pending",
    construction: "pending",
    work_done: "pending",
    invoice: "pending",
    payment: "pending",
  };
}

function applyWorkSessionStages(
  p: ProjectListItemV1["pipeline"],
  ref: ProjectRefV1,
  afterOrdered: boolean
): void {
  if (!afterOrdered) return;
  const session = getLatestWorkSessionForProject(ref);
  if (!session) return;

  if (session.arrivalTime || session.startTime) {
    if (session.completionTime) {
      p.construction = "done";
    } else {
      p.construction = "active";
    }
  }

  if (session.completionTime) {
    p.work_done = "active";
  }
}

function fieldOpsProgress(ref: ProjectRefV1): {
  hasTemplates: boolean;
  fieldCheckDone: boolean;
  fieldCheckActive: boolean;
  purchaseDone: boolean;
  purchaseActive: boolean;
} {
  const db = getDatabase();
  const tpl = db
    .prepare(
      `SELECT COUNT(*) as c FROM project_work_templates WHERE project_source = ? AND project_id = ?`
    )
    .get(ref.source, ref.projectId) as { c: number };
  const hasTemplates = (tpl?.c ?? 0) > 0;

  const fcProgress = getFieldCheckProgressV1(ref);
  const fcTotal = fcProgress.total;
  const fcChecked = fcProgress.checked;
  const fieldCheckDone = fcTotal > 0 && fcChecked >= fcTotal;
  const fieldCheckActive = fcTotal > 0 && !fieldCheckDone;

  const pl = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'carried' THEN 1 ELSE 0 END) as carried,
              SUM(CASE WHEN status IN ('pending','ordered','received') THEN 1 ELSE 0 END) as open
       FROM purchase_lines WHERE project_source = ? AND project_id = ?`
    )
    .get(ref.source, ref.projectId) as { total: number; carried: number | null; open: number | null };
  const plTotal = pl?.total ?? 0;
  const purchaseDone = plTotal > 0 && (pl?.open ?? 0) === 0;
  const purchaseActive = plTotal > 0 && !purchaseDone;

  return { hasTemplates, fieldCheckDone, fieldCheckActive, purchaseDone, purchaseActive };
}

function applyFieldOpsStages(
  p: ProjectListItemV1["pipeline"],
  ref: ProjectRefV1,
  afterOrdered: boolean
): void {
  if (!afterOrdered) return;
  const ops = fieldOpsProgress(ref);
  if (ops.hasTemplates || ops.fieldCheckActive || ops.fieldCheckDone) {
    if (ops.fieldCheckDone) p.field_check = "done";
    else if (ops.fieldCheckActive) p.field_check = "active";
    else if (ops.hasTemplates) p.field_check = "pending";
  }
  if (ops.purchaseActive) p.purchase = "active";
  else if (ops.purchaseDone) p.purchase = "done";
  else if (ops.hasTemplates && p.ordered === "done") p.purchase = "pending";
}

function pipelineFromBusinessStatus(
  status: string,
  hasInvoice: boolean,
  hasPaid: boolean,
  ref: ProjectRefV1
): ProjectListItemV1["pipeline"] {
  const p = emptyPipeline();
  const s = status.toLowerCase();

  if (["new", "survey_scheduled"].includes(s)) {
    p.survey = "active";
  } else if (
    [
      "survey_done",
      "estimate_created",
      "estimate_sent",
      "construction_scheduled",
      "construction_done",
      "completion_report_created",
      "invoice_created",
      "invoice_sent",
      "invoiced",
      "paid",
      "closed",
    ].includes(s)
  ) {
    p.survey = "done";
  }

  if (["survey_done", "estimate_created"].includes(s)) {
    p.estimate = "active";
  } else if (
    ["estimate_sent", "construction_scheduled", "construction_done", "invoiced", "paid", "closed"].includes(s)
  ) {
    p.estimate = "done";
  }

  const orderedDone = [
    "estimate_sent",
    "construction_scheduled",
    "construction_done",
    "completion_report_created",
    "invoice_created",
    "invoice_sent",
    "invoiced",
    "paid",
    "closed",
  ].includes(s);
  if (orderedDone) p.ordered = "done";
  else if (["estimate_created", "estimate_sent"].includes(s)) p.ordered = "active";

  if (["construction_scheduled"].includes(s)) {
    p.construction = "active";
  } else if (
    ["construction_done", "completion_report_created", "invoiced", "paid", "closed"].includes(s)
  ) {
    p.construction = "done";
  }

  if (["construction_done", "completion_report_created", "invoiced", "paid", "closed"].includes(s)) {
    p.work_done = "done";
  } else if (["construction_scheduled"].includes(s)) {
    p.work_done = "pending";
  }

  if (hasInvoice && !hasPaid) {
    p.invoice = "active";
  } else if (hasPaid || s === "paid" || s === "closed") {
    p.invoice = "done";
  } else if (["invoice_created", "invoice_sent", "invoiced"].includes(s)) {
    p.invoice = "active";
  }

  if (hasPaid || s === "paid" || s === "closed") {
    p.payment = "done";
  } else if (hasInvoice) {
    p.payment = "active";
  }

  applyFieldOpsStages(p, ref, orderedDone || p.estimate === "done");
  applyWorkSessionStages(p, ref, orderedDone || p.estimate === "done");
  if (p.work_done === "done") p.construction = "done";
  return p;
}

function pipelineFromSurveyStatus(status: string, ref: ProjectRefV1): ProjectListItemV1["pipeline"] {
  const p = emptyPipeline();

  if (status === "surveying") {
    p.survey = "active";
  } else {
    p.survey = "done";
  }

  if (status === "estimate_pending") {
    p.estimate = "active";
  } else if (["estimate_done", "ordered", "completed"].includes(status)) {
    p.estimate = "done";
  }

  if (status === "ordered") {
    p.ordered = "active";
  } else if (status === "completed") {
    p.ordered = "done";
  } else if (["estimate_done"].includes(status)) {
    p.ordered = "pending";
  }

  if (status === "ordered") {
    p.construction = "active";
  } else if (status === "completed") {
    p.construction = "done";
    p.work_done = "done";
  }

  const afterOrdered = ["ordered", "completed"].includes(status);
  applyFieldOpsStages(p, ref, afterOrdered || p.estimate === "done");
  applyWorkSessionStages(p, ref, afterOrdered || p.estimate === "done");
  if (p.work_done === "done") p.construction = "done";

  return p;
}

export function listProjectsV1(opts?: { customerCode?: string; limit?: number }): ProjectListItemV1[] {
  const limit = opts?.limit ?? 80;
  const items: ProjectListItemV1[] = [];
  const db = getDatabase();

  const bizRows = db
    .prepare(
      `SELECT id, project_no, title, customer_name, address, status, estimate_id, invoice_id, paid_date, updated_at
       FROM business_projects
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, string | null>>;

  for (const r of bizRows) {
    const id = String(r.id);
    const hasInvoice = Boolean(r.invoice_id);
    const hasPaid = Boolean(r.paid_date);
    const ref: ProjectRefV1 = { source: "business", projectId: id };
    items.push({
      id,
      projectNo: String(r.project_no ?? r.id),
      title: String(r.title ?? ""),
      customerName: String(r.customer_name ?? ""),
      address: String(r.address ?? ""),
      status: String(r.status ?? ""),
      statusLabel: STATUS_LABELS[String(r.status)] ?? String(r.status),
      pipeline: pipelineFromBusinessStatus(String(r.status), hasInvoice, hasPaid, ref),
      source: "business",
      updatedAt: String(r.updated_at),
      hasEstimate: Boolean(r.estimate_id),
      hasInvoice,
    });
  }

  const surveyRows = db
    .prepare(
      `SELECT project_id, project_no, site_name, customer_name, address, workflow_status, updated_at
       FROM survey_projects
       WHERE deleted_at IS NULL
         AND project_id NOT IN (SELECT COALESCE(survey_project_id,'') FROM business_projects WHERE survey_project_id IS NOT NULL AND deleted_at IS NULL)
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, string | null>>;

  for (const r of surveyRows) {
    const id = String(r.project_id);
    const ws = String(r.workflow_status ?? "surveying");
    const ref: ProjectRefV1 = { source: "survey", projectId: id };
    items.push({
      id,
      projectNo: String(r.project_no ?? r.project_id),
      title: String(r.site_name ?? ""),
      customerName: String(r.customer_name ?? ""),
      address: String(r.address ?? ""),
      status: ws,
      statusLabel: STATUS_LABELS[ws] ?? ws,
      pipeline: pipelineFromSurveyStatus(ws, ref),
      source: "survey",
      updatedAt: String(r.updated_at),
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

function formatTimelineDate(iso: string): string {
  const d = iso.slice(0, 10);
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  return `${m}/${day}`;
}

export function getProjectDetailV1(id: string, source?: string): ProjectDetailV1 | null {
  const db = getDatabase();
  if (source !== "survey") {
    const row = db
      .prepare(
        `SELECT id, project_no, title, customer_name, address, phone, status, invoice_id, paid_date, updated_at,
                survey_schedule_json, construction_schedule_json, payment_due_date, paid_date AS paid
         FROM business_projects WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as Record<string, string | null> | undefined;
    if (row) {
      const hasInvoice = Boolean(row.invoice_id);
      const hasPaid = Boolean(row.paid_date);
      const ref: ProjectRefV1 = { source: "business", projectId: id };
      const project: ProjectListItemV1 = {
        id: String(row.id),
        projectNo: String(row.project_no ?? row.id),
        title: String(row.title ?? ""),
        customerName: String(row.customer_name ?? ""),
        address: String(row.address ?? ""),
        status: String(row.status ?? ""),
        statusLabel: STATUS_LABELS[String(row.status)] ?? String(row.status),
        pipeline: pipelineFromBusinessStatus(String(row.status), hasInvoice, hasPaid, ref),
        source: "business",
        updatedAt: String(row.updated_at),
      };
      const timeline: ProjectTimelineItemV1[] = [];
      const tl = listProjectTimeline(id);
      for (const t of tl) {
        timeline.push({
          date: formatTimelineDate(t.createdAt),
          label: t.title,
          detail: t.detail,
        });
      }
      if (!timeline.length) {
        let surveyDate: string | null = null;
        let constructionDate: string | null = null;
        try {
          const ss = JSON.parse(String(row.survey_schedule_json ?? "{}")) as { date?: string };
          surveyDate = ss.date ?? null;
        } catch {
          /* */
        }
        try {
          const cs = JSON.parse(String(row.construction_schedule_json ?? "{}")) as { date?: string };
          constructionDate = cs.date ?? null;
        } catch {
          /* */
        }
        if (surveyDate) timeline.push({ date: formatTimelineDate(surveyDate), label: "現調", detail: "" });
        if (constructionDate) timeline.push({ date: formatTimelineDate(constructionDate), label: "工事", detail: "" });
        if (hasInvoice) timeline.push({ date: "—", label: "請求", detail: "" });
        if (hasPaid && row.paid_date) {
          timeline.push({ date: formatTimelineDate(String(row.paid_date)), label: "入金", detail: "" });
        }
      }
      return {
        project,
        timeline,
        phone: row.phone ? String(row.phone) : null,
        assignee: null,
        workSession: getLatestWorkSessionForProject(ref),
        completionChecklist: listCompletionChecklistV1(ref),
      };
    }
  }

  const survey = db
    .prepare(
      `SELECT project_id, project_no, site_name, customer_name, address, phone, assignee, workflow_status, survey_date, updated_at
       FROM survey_projects WHERE project_id = ? AND deleted_at IS NULL`
    )
    .get(id) as Record<string, string | null> | undefined;
  if (!survey) return null;

  const ws = String(survey.workflow_status ?? "surveying");
  const ref: ProjectRefV1 = { source: "survey", projectId: id };
  const project: ProjectListItemV1 = {
    id: String(survey.project_id),
    projectNo: String(survey.project_no ?? survey.project_id),
    title: String(survey.site_name ?? ""),
    customerName: String(survey.customer_name ?? ""),
    address: String(survey.address ?? ""),
    status: ws,
    statusLabel: STATUS_LABELS[ws] ?? ws,
    pipeline: pipelineFromSurveyStatus(ws, ref),
    source: "survey",
    updatedAt: String(survey.updated_at),
  };
  const timeline: ProjectTimelineItemV1[] = [];
  if (survey.survey_date) {
    timeline.push({ date: formatTimelineDate(String(survey.survey_date)), label: "現調", detail: "" });
  }
  if (ws === "estimate_pending" || ws === "estimate_done") {
    timeline.push({ date: "—", label: "見積", detail: "" });
  }
  return {
    project,
    timeline,
    phone: survey.phone ? String(survey.phone) : null,
    assignee: survey.assignee ? String(survey.assignee) : null,
    workSession: getLatestWorkSessionForProject(ref),
    completionChecklist: listCompletionChecklistV1(ref),
  };
}

export interface DeleteProjectV1Result {
  ok: boolean;
  hadEstimate: boolean;
  hadInvoice: boolean;
  pdfCount: number;
  projectTitle: string;
}

export interface DeleteProjectPreviewV1 {
  projectTitle: string;
  estimateCount: number;
  invoiceCount: number;
  pdfCount: number;
}

export interface DeletedProjectListItemV1 {
  id: string;
  projectNo: string;
  title: string;
  customerName: string;
  source: "business" | "survey";
  deletedAt: string;
  estimateCount: number;
  invoiceCount: number;
  pdfCount: number;
}

export function getProjectDeletePreviewV1(
  id: string,
  source: "business" | "survey"
): DeleteProjectPreviewV1 | null {
  const db = getDatabase();
  if (source === "business") {
    const row = db
      .prepare(
        `SELECT title, estimate_id, invoice_id, deleted_at FROM business_projects WHERE id = ?`
      )
      .get(id) as
      | { title: string; estimate_id: string | null; invoice_id: string | null; deleted_at: string | null }
      | undefined;
    if (!row || row.deleted_at) return null;
    return {
      projectTitle: String(row.title ?? ""),
      estimateCount: row.estimate_id ? 1 : 0,
      invoiceCount: row.invoice_id ? 1 : 0,
      pdfCount: countExistingProjectPdfsV1(id),
    };
  }
  const survey = db
    .prepare(`SELECT site_name, deleted_at FROM survey_projects WHERE project_id = ?`)
    .get(id) as { site_name: string; deleted_at: string | null } | undefined;
  if (!survey || survey.deleted_at) return null;
  return {
    projectTitle: String(survey.site_name ?? ""),
    estimateCount: 0,
    invoiceCount: 0,
    pdfCount: 0,
  };
}

export function deleteProjectV1(id: string, source: "business" | "survey"): DeleteProjectV1Result | null {
  const preview = getProjectDeletePreviewV1(id, source);
  if (!preview) return null;
  const db = getDatabase();
  const now = new Date().toISOString();

  if (source === "business") {
    const row = db
      .prepare(
        `SELECT id, estimate_id, invoice_id, deleted_at, title FROM business_projects WHERE id = ?`
      )
      .get(id) as {
      id: string;
      estimate_id: string | null;
      invoice_id: string | null;
      deleted_at: string | null;
      title: string;
    } | undefined;
    if (!row || row.deleted_at) return null;
    db.prepare(`UPDATE business_projects SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
    return {
      ok: true,
      hadEstimate: Boolean(row.estimate_id),
      hadInvoice: Boolean(row.invoice_id),
      pdfCount: preview.pdfCount,
      projectTitle: String(row.title ?? preview.projectTitle),
    };
  }

  const survey = db
    .prepare(`SELECT project_id, deleted_at FROM survey_projects WHERE project_id = ?`)
    .get(id) as { project_id: string; deleted_at: string | null } | undefined;
  if (!survey || survey.deleted_at) return null;
  db.prepare(`UPDATE survey_projects SET deleted_at = ?, updated_at = ? WHERE project_id = ?`).run(now, now, id);
  return {
    ok: true,
    hadEstimate: false,
    hadInvoice: false,
    pdfCount: 0,
    projectTitle: preview.projectTitle,
  };
}

export function listDeletedProjectsV1(opts?: { limit?: number }): DeletedProjectListItemV1[] {
  const limit = opts?.limit ?? 80;
  const db = getDatabase();
  const items: DeletedProjectListItemV1[] = [];

  const bizRows = db
    .prepare(
      `SELECT id, project_no, title, customer_name, estimate_id, invoice_id, deleted_at
       FROM business_projects
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, string | null>>;

  for (const r of bizRows) {
    const id = String(r.id);
    items.push({
      id,
      projectNo: String(r.project_no ?? r.id),
      title: String(r.title ?? ""),
      customerName: String(r.customer_name ?? ""),
      source: "business",
      deletedAt: String(r.deleted_at),
      estimateCount: r.estimate_id ? 1 : 0,
      invoiceCount: r.invoice_id ? 1 : 0,
      pdfCount: countExistingProjectPdfsV1(id),
    });
  }

  const surveyRows = db
    .prepare(
      `SELECT project_id, project_no, site_name, customer_name, deleted_at
       FROM survey_projects
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, string | null>>;

  for (const r of surveyRows) {
    items.push({
      id: String(r.project_id),
      projectNo: String(r.project_no ?? r.project_id),
      title: String(r.site_name ?? ""),
      customerName: String(r.customer_name ?? ""),
      source: "survey",
      deletedAt: String(r.deleted_at),
      estimateCount: 0,
      invoiceCount: 0,
      pdfCount: 0,
    });
  }

  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).slice(0, limit);
}

export function restoreProjectV1(id: string, source: "business" | "survey"): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  if (source === "business") {
    const row = db
      .prepare(`SELECT id, deleted_at FROM business_projects WHERE id = ?`)
      .get(id) as { id: string; deleted_at: string | null } | undefined;
    if (!row?.deleted_at) return false;
    db.prepare(`UPDATE business_projects SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now, id);
    return true;
  }
  const survey = db
    .prepare(`SELECT project_id, deleted_at FROM survey_projects WHERE project_id = ?`)
    .get(id) as { project_id: string; deleted_at: string | null } | undefined;
  if (!survey?.deleted_at) return false;
  db.prepare(`UPDATE survey_projects SET deleted_at = NULL, updated_at = ? WHERE project_id = ?`).run(
    now,
    id
  );
  return true;
}
