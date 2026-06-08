/** 案件一覧 PWA v1 — business + survey 統合表示 */

import { getDatabase } from "../db/database.js";
import { listProjectTimeline } from "../toms/project-timeline.js";

export type ProjectPipelineStage =
  | "survey"
  | "estimate"
  | "construction"
  | "invoice"
  | "payment"
  | "done";

export interface ProjectListItemV1 {
  id: string;
  projectNo: string;
  title: string;
  customerName: string;
  address: string;
  status: string;
  statusLabel: string;
  pipeline: Record<ProjectPipelineStage, "pending" | "active" | "done">;
  source: "business" | "survey";
  updatedAt: string;
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

function pipelineFromBusinessStatus(status: string, hasInvoice: boolean, hasPaid: boolean): ProjectListItemV1["pipeline"] {
  const p: ProjectListItemV1["pipeline"] = {
    survey: "pending",
    estimate: "pending",
    construction: "pending",
    invoice: "pending",
    payment: "pending",
    done: "pending",
  };
  const s = status.toLowerCase();
  if (["survey_scheduled", "surveying"].includes(s)) {
    p.survey = "active";
  } else if (["survey_done", "estimate_created", "estimate_sent", "construction_scheduled", "construction_done", "invoiced", "paid", "closed"].includes(s)) {
    p.survey = "done";
  }
  if (["estimate_created", "estimate_sent"].includes(s)) {
    p.estimate = "active";
  } else if (["construction_scheduled", "construction_done", "invoiced", "paid", "closed"].includes(s)) {
    p.estimate = "done";
  }
  if (["construction_scheduled"].includes(s)) {
    p.construction = "active";
  } else if (["construction_done", "invoiced", "paid", "closed"].includes(s)) {
    p.construction = "done";
  }
  if (hasInvoice && !hasPaid) {
    p.invoice = "active";
  } else if (hasPaid) {
    p.invoice = "done";
  }
  if (hasPaid) {
    p.payment = "done";
    p.done = "done";
  } else if (hasInvoice) {
    p.payment = "pending";
  }
  return p;
}

function pipelineFromSurveyStatus(status: string): ProjectListItemV1["pipeline"] {
  const p: ProjectListItemV1["pipeline"] = {
    survey: "active",
    estimate: "pending",
    construction: "pending",
    invoice: "pending",
    payment: "pending",
    done: "pending",
  };
  if (status === "estimate_pending") {
    p.survey = "done";
    p.estimate = "active";
  } else if (["estimate_done", "ordered", "completed"].includes(status)) {
    p.survey = "done";
    p.estimate = "done";
  }
  if (status === "ordered") p.construction = "active";
  if (status === "completed") {
    p.construction = "done";
    p.done = "done";
  }
  return p;
}

export function listProjectsV1(opts?: { customerCode?: string; limit?: number }): ProjectListItemV1[] {
  const limit = opts?.limit ?? 80;
  const items: ProjectListItemV1[] = [];
  const db = getDatabase();

  const bizRows = db
    .prepare(
      `SELECT id, project_no, title, customer_name, address, status, invoice_id, paid_date, updated_at
       FROM business_projects ORDER BY updated_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, string | null>>;

  for (const r of bizRows) {
    const hasInvoice = Boolean(r.invoice_id);
    const hasPaid = Boolean(r.paid_date);
    items.push({
      id: String(r.id),
      projectNo: String(r.project_no ?? r.id),
      title: String(r.title ?? ""),
      customerName: String(r.customer_name ?? ""),
      address: String(r.address ?? ""),
      status: String(r.status ?? ""),
      statusLabel: STATUS_LABELS[String(r.status)] ?? String(r.status),
      pipeline: pipelineFromBusinessStatus(String(r.status), hasInvoice, hasPaid),
      source: "business",
      updatedAt: String(r.updated_at),
    });
  }

  const surveyRows = db
    .prepare(
      `SELECT project_id, project_no, site_name, customer_name, address, workflow_status, updated_at
       FROM survey_projects
       WHERE project_id NOT IN (SELECT COALESCE(survey_project_id,'') FROM business_projects WHERE survey_project_id IS NOT NULL)
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, string | null>>;

  for (const r of surveyRows) {
    const ws = String(r.workflow_status ?? "surveying");
    items.push({
      id: String(r.project_id),
      projectNo: String(r.project_no ?? r.project_id),
      title: String(r.site_name ?? ""),
      customerName: String(r.customer_name ?? ""),
      address: String(r.address ?? ""),
      status: ws,
      statusLabel: STATUS_LABELS[ws] ?? ws,
      pipeline: pipelineFromSurveyStatus(ws),
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
         FROM business_projects WHERE id = ?`
      )
      .get(id) as Record<string, string | null> | undefined;
    if (row) {
      const hasInvoice = Boolean(row.invoice_id);
      const hasPaid = Boolean(row.paid_date);
      const project: ProjectListItemV1 = {
        id: String(row.id),
        projectNo: String(row.project_no ?? row.id),
        title: String(row.title ?? ""),
        customerName: String(row.customer_name ?? ""),
        address: String(row.address ?? ""),
        status: String(row.status ?? ""),
        statusLabel: STATUS_LABELS[String(row.status)] ?? String(row.status),
        pipeline: pipelineFromBusinessStatus(String(row.status), hasInvoice, hasPaid),
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
        } catch { /* */ }
        try {
          const cs = JSON.parse(String(row.construction_schedule_json ?? "{}")) as { date?: string };
          constructionDate = cs.date ?? null;
        } catch { /* */ }
        if (surveyDate) timeline.push({ date: formatTimelineDate(surveyDate), label: "現調", detail: "" });
        if (constructionDate) timeline.push({ date: formatTimelineDate(constructionDate), label: "工事", detail: "" });
        if (hasInvoice) timeline.push({ date: "—", label: "請求", detail: "" });
        if (hasPaid && row.paid_date) {
          timeline.push({ date: formatTimelineDate(String(row.paid_date)), label: "入金", detail: "" });
        }
      }
      return { project, timeline, phone: row.phone ? String(row.phone) : null, assignee: null };
    }
  }

  const survey = db
    .prepare(
      `SELECT project_id, project_no, site_name, customer_name, address, phone, assignee, workflow_status, survey_date, updated_at
       FROM survey_projects WHERE project_id = ?`
    )
    .get(id) as Record<string, string | null> | undefined;
  if (!survey) return null;

  const ws = String(survey.workflow_status ?? "surveying");
  const project: ProjectListItemV1 = {
    id: String(survey.project_id),
    projectNo: String(survey.project_no ?? survey.project_id),
    title: String(survey.site_name ?? ""),
    customerName: String(survey.customer_name ?? ""),
    address: String(survey.address ?? ""),
    status: ws,
    statusLabel: STATUS_LABELS[ws] ?? ws,
    pipeline: pipelineFromSurveyStatus(ws),
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
  };
}
