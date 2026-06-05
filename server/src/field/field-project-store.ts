import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { createBusinessProject, updateBusinessProject } from "../business/business-store.js";
import { createSurveyProject } from "../survey/survey-store.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import type { FieldProjectInput, FieldProjectRecord } from "./field-project-types.js";

function rowToFieldProject(row: Record<string, unknown>): FieldProjectRecord {
  let planCandidates: string[] = [];
  try {
    planCandidates = JSON.parse(String(row.plan_candidates_json ?? "[]")) as string[];
  } catch {
    planCandidates = [];
  }
  return {
    id: String(row.id),
    customerCode: String(row.customer_code),
    customerName: String(row.customer_name),
    address: String(row.address ?? ""),
    buildingType: String(row.building_type ?? "other"),
    planCandidates,
    surveyStaff: String(row.survey_staff ?? ""),
    scheduledDate: String(row.scheduled_date ?? ""),
    memo: String(row.memo ?? ""),
    surveyProjectId: String(row.survey_project_id),
    businessProjectId: String(row.business_project_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createFieldProject(input: FieldProjectInput): FieldProjectRecord {
  const customerCode = (input.customerCode ?? "TOMS001").toUpperCase();
  const siteName = `${input.customerName} — ${input.address}`.slice(0, 120);
  const survey = createSurveyProject({
    customerCode,
    siteName,
    address: input.address,
    status: "active",
  });

  const business = createBusinessProject({
    customerId: customerCode,
    customerName: input.customerName,
    title: siteName,
    address: input.address,
    surveyProjectId: survey.projectId,
  });

  updateBusinessProject(business.id, {
    surveySchedule: {
      date: input.scheduledDate,
      memo: `担当: ${input.surveyStaff} / 建物: ${input.buildingType} / プラン: ${input.planCandidates.join(", ")}`,
    },
    surveyMemo: input.memo ?? "",
    status: "survey_scheduled",
  });

  appendProjectTimeline({
    projectId: business.id,
    eventType: "survey",
    title: "現調案件ウィザード作成",
    detail: `${input.customerName} — ${input.scheduledDate} 予定`,
    actor: input.surveyStaff || "field-wizard",
    metadata: {
      fieldWizard: true,
      buildingType: input.buildingType,
      planCandidates: input.planCandidates,
      surveyProjectId: survey.projectId,
    },
  });

  const id = `FLD-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO field_projects (
        id, customer_code, customer_name, address, building_type, plan_candidates_json,
        survey_staff, scheduled_date, memo, survey_project_id, business_project_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      customerCode,
      input.customerName,
      input.address,
      input.buildingType,
      JSON.stringify(input.planCandidates ?? []),
      input.surveyStaff,
      input.scheduledDate,
      input.memo ?? "",
      survey.projectId,
      business.id,
      now,
      now
    );

  return getFieldProject(id)!;
}

export function getFieldProject(id: string): FieldProjectRecord | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM field_projects WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToFieldProject(row) : null;
}

export function getFieldProjectBySurveyId(surveyProjectId: string): FieldProjectRecord | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM field_projects WHERE survey_project_id = ?`)
    .get(surveyProjectId) as Record<string, unknown> | undefined;
  return row ? rowToFieldProject(row) : null;
}

export function getFieldProjectByBusinessId(businessProjectId: string): FieldProjectRecord | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM field_projects WHERE business_project_id = ?`)
    .get(businessProjectId) as Record<string, unknown> | undefined;
  return row ? rowToFieldProject(row) : null;
}
