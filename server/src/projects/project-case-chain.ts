/** 案件番号1つで現調→見積→施工→請求→入金を連動するためのチェーン管理 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export interface ProjectCaseChain {
  id: string;
  caseNo: string;
  surveyProjectId: string | null;
  businessProjectId: string | null;
  customerCode: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToChain(r: Record<string, unknown>): ProjectCaseChain {
  return {
    id: String(r.id),
    caseNo: String(r.case_no),
    surveyProjectId: r.survey_project_id ? String(r.survey_project_id) : null,
    businessProjectId: r.business_project_id ? String(r.business_project_id) : null,
    customerCode: r.customer_code ? String(r.customer_code) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function generateCaseNo(): string {
  const y = new Date().getFullYear().toString().slice(-2);
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS c FROM project_case_chain`)
    .get() as { c: number };
  const seq = String(row.c + 1).padStart(4, "0");
  return `CASE-${y}${seq}`;
}

export function upsertProjectCaseChain(input: {
  caseNo?: string;
  surveyProjectId?: string | null;
  businessProjectId?: string | null;
  customerCode?: string | null;
}): ProjectCaseChain {
  const db = getDatabase();
  if (input.surveyProjectId) {
    const existing = db
      .prepare(`SELECT * FROM project_case_chain WHERE survey_project_id = ?`)
      .get(input.surveyProjectId) as Record<string, unknown> | undefined;
    if (existing) {
      if (input.businessProjectId) {
        db.prepare(
          `UPDATE project_case_chain SET business_project_id = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(input.businessProjectId, existing.id);
      }
      return rowToChain({ ...existing, business_project_id: input.businessProjectId ?? existing.business_project_id });
    }
  }
  if (input.businessProjectId) {
    const existing = db
      .prepare(`SELECT * FROM project_case_chain WHERE business_project_id = ?`)
      .get(input.businessProjectId) as Record<string, unknown> | undefined;
    if (existing) return rowToChain(existing);
  }
  const id = uuid();
  const caseNo = input.caseNo ?? generateCaseNo();
  db.prepare(
    `INSERT INTO project_case_chain (id, case_no, survey_project_id, business_project_id, customer_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, caseNo, input.surveyProjectId ?? null, input.businessProjectId ?? null, input.customerCode ?? null);
  const row = db.prepare(`SELECT * FROM project_case_chain WHERE id = ?`).get(id) as Record<string, unknown>;
  return rowToChain(row);
}

export function getCaseChainBySurveyId(surveyProjectId: string): ProjectCaseChain | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM project_case_chain WHERE survey_project_id = ?`)
    .get(surveyProjectId) as Record<string, unknown> | undefined;
  return row ? rowToChain(row) : null;
}

export function getCaseChainByBusinessId(businessProjectId: string): ProjectCaseChain | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM project_case_chain WHERE business_project_id = ?`)
    .get(businessProjectId) as Record<string, unknown> | undefined;
  return row ? rowToChain(row) : null;
}
