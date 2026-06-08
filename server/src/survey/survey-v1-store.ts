import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  SURVEY_MATERIAL_CATEGORIES,
  SURVEY_WORKFLOW_STATUSES,
  type SurveyMaterialCategory,
  type SurveyMaterialV1,
  type SurveyPhotoV1,
  type SurveyProjectV1,
  type SurveyWorkflowStatus,
} from "./survey-v1-types.js";
import { surveyUploadsDir } from "./survey-store.js";

export interface SurveyHandoffLogV1 {
  id: string;
  surveyProjectId: string;
  businessProjectId: string;
  handoffBy: string | null;
  handoffAt: string;
  payloadJson: Record<string, unknown>;
}

export interface SurveyProjectV1Detail extends SurveyProjectV1 {
  notes: string | null;
  photos: SurveyPhotoV1[];
  materials: SurveyMaterialV1[];
  handoff: SurveyHandoffLogV1 | null;
}

function isWorkflowStatus(v: string): v is SurveyWorkflowStatus {
  return (SURVEY_WORKFLOW_STATUSES as readonly string[]).includes(v);
}

function isMaterialCategory(v: string): v is SurveyMaterialCategory {
  return (SURVEY_MATERIAL_CATEGORIES as readonly string[]).includes(v);
}

function nextProjectNo(): string {
  const year = new Date().getFullYear();
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM survey_projects WHERE project_no LIKE ?`)
    .get(`G${year}-%`) as { c: number };
  const n = (row?.c ?? 0) + 1;
  return `G${year}-${String(n).padStart(4, "0")}`;
}

function rowToProject(r: Record<string, unknown>): SurveyProjectV1 {
  return {
    projectId: String(r.project_id),
    projectNo: r.project_no != null ? String(r.project_no) : null,
    customerCode: String(r.customer_code),
    customerName: String(r.customer_name ?? r.site_name ?? ""),
    siteName: String(r.site_name),
    address: r.address != null ? String(r.address) : null,
    phone: r.phone != null ? String(r.phone) : null,
    email: r.email != null ? String(r.email) : null,
    surveyDate: r.survey_date != null ? String(r.survey_date) : null,
    assignee: r.assignee != null ? String(r.assignee) : null,
    gpsLat: r.gps_lat != null ? Number(r.gps_lat) : null,
    gpsLng: r.gps_lng != null ? Number(r.gps_lng) : null,
    status: String(r.status),
    workflowStatus: isWorkflowStatus(String(r.workflow_status ?? "surveying"))
      ? (String(r.workflow_status) as SurveyWorkflowStatus)
      : "surveying",
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToPhoto(r: Record<string, unknown>): SurveyPhotoV1 {
  const photoPath = String(r.photo_path);
  return {
    id: String(r.id),
    photoType: String(r.photo_type),
    photoPath,
    url: photoPath.startsWith("_memo:") ? "" : `/uploads/survey/${photoPath}`,
    comment: r.comment != null ? String(r.comment) : null,
    takenAt: r.taken_at != null ? String(r.taken_at) : null,
    uploadedBy: r.uploaded_by != null ? String(r.uploaded_by) : null,
    createdAt: String(r.created_at),
  };
}

function rowToMaterial(r: Record<string, unknown>): SurveyMaterialV1 {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    category: String(r.category) as SurveyMaterialCategory,
    itemLabel: String(r.item_label ?? ""),
    quantity: Number(r.quantity ?? 1),
    memo: String(r.memo ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function parsePayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getProjectNotes(projectId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT notes FROM survey_project_notes WHERE project_id = ?`)
    .get(projectId) as { notes: string } | undefined;
  return row?.notes ?? null;
}

function saveProjectNotes(projectId: string, notes: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO survey_project_notes (project_id, notes, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`
    )
    .run(projectId, notes);
}

export function listSurveyProjectsV1(opts?: {
  customerCode?: string;
  workflowStatus?: SurveyWorkflowStatus;
}): SurveyProjectV1[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.customerCode) {
    clauses.push("customer_code = ?");
    params.push(opts.customerCode.toUpperCase());
  }
  if (opts?.workflowStatus) {
    clauses.push("workflow_status = ?");
    params.push(opts.workflowStatus);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDatabase()
    .prepare(`SELECT * FROM survey_projects ${where} ORDER BY updated_at DESC`)
    .all(...params) as Record<string, unknown>[];
  return rows.map(rowToProject);
}

export function createSurveyProjectV1(input: {
  customerCode: string;
  customerName: string;
  siteName?: string;
  address?: string;
  phone?: string;
  email?: string;
  surveyDate?: string;
  assignee?: string;
  notes?: string;
  projectNo?: string;
}): SurveyProjectV1 {
  const projectId = `SVY-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const siteName = input.siteName?.trim() || input.customerName.trim();
  const projectNo = input.projectNo?.trim() || nextProjectNo();
  getDatabase()
    .prepare(
      `INSERT INTO survey_projects (
        project_id, project_no, customer_code, customer_name, site_name,
        address, phone, email, survey_date, assignee,
        status, workflow_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'surveying', ?, ?)`
    )
    .run(
      projectId,
      projectNo,
      input.customerCode.toUpperCase(),
      input.customerName.trim(),
      siteName,
      input.address?.trim() ?? null,
      input.phone?.trim() ?? null,
      input.email?.trim() ?? null,
      input.surveyDate ?? null,
      input.assignee?.trim() ?? null,
      now,
      now
    );
  if (input.notes?.trim()) {
    saveProjectNotes(projectId, input.notes.trim());
  }
  return getSurveyProjectV1(projectId)!;
}

export function getSurveyProjectV1(projectId: string): SurveyProjectV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM survey_projects WHERE project_id = ?`)
    .get(projectId) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export function getSurveyProjectV1Detail(projectId: string): SurveyProjectV1Detail | null {
  const project = getSurveyProjectV1(projectId);
  if (!project) return null;
  const photos = listSurveyPhotosV1(projectId);
  const materials = listSurveyMaterialsV1(projectId);
  const handoffRow = getDatabase()
    .prepare(`SELECT * FROM survey_handoff_log WHERE survey_project_id = ?`)
    .get(projectId) as Record<string, unknown> | undefined;
  const handoff = handoffRow
    ? {
        id: String(handoffRow.id),
        surveyProjectId: String(handoffRow.survey_project_id),
        businessProjectId: String(handoffRow.business_project_id),
        handoffBy: handoffRow.handoff_by != null ? String(handoffRow.handoff_by) : null,
        handoffAt: String(handoffRow.handoff_at),
        payloadJson: parsePayload(handoffRow.payload_json as string),
      }
    : null;
  return {
    ...project,
    notes: getProjectNotes(projectId),
    photos,
    materials,
    handoff,
  };
}

export function updateSurveyProjectV1(
  projectId: string,
  patch: Partial<{
    customerName: string;
    siteName: string;
    address: string;
    phone: string;
    email: string;
    surveyDate: string;
    assignee: string;
    notes: string;
    workflowStatus: SurveyWorkflowStatus;
  }>
): SurveyProjectV1 | null {
  const existing = getSurveyProjectV1(projectId);
  if (!existing) return null;
  if (patch.workflowStatus && !isWorkflowStatus(patch.workflowStatus)) {
    throw new Error("invalid workflow_status");
  }
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE survey_projects SET
        customer_name = ?, site_name = ?, address = ?, phone = ?, email = ?,
        survey_date = ?, assignee = ?,
        workflow_status = COALESCE(?, workflow_status),
        updated_at = ?
       WHERE project_id = ?`
    )
    .run(
      patch.customerName ?? existing.customerName,
      patch.siteName ?? existing.siteName,
      patch.address !== undefined ? patch.address : existing.address,
      patch.phone !== undefined ? patch.phone : existing.phone,
      patch.email !== undefined ? patch.email : existing.email,
      patch.surveyDate !== undefined ? patch.surveyDate : existing.surveyDate,
      patch.assignee !== undefined ? patch.assignee : existing.assignee,
      patch.workflowStatus ?? null,
      now,
      projectId
    );
  if (patch.notes !== undefined) {
    saveProjectNotes(projectId, patch.notes);
  }
  return getSurveyProjectV1(projectId);
}

export function listSurveyPhotosV1(projectId: string): SurveyPhotoV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, photo_type, photo_path, comment, taken_at, uploaded_by, datetime(created_at) as created_at
       FROM survey_photos WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map(rowToPhoto);
}

export function addSurveyPhotoMemoV1(
  projectId: string,
  input: {
    comment?: string;
    imageBase64?: string;
    fileName?: string;
    takenAt?: string;
    uploadedBy?: string;
  }
): SurveyPhotoV1 {
  if (!getSurveyProjectV1(projectId)) throw new Error("project not found");
  const id = uuid();
  const now = new Date().toISOString();
  const takenAt = input.takenAt ?? now;
  let photoPath: string;

  if (input.imageBase64) {
    const ext = path.extname(input.fileName ?? ".jpg") || ".jpg";
    const fname = `${uuid()}${ext}`;
    const full = path.join(surveyUploadsDir(projectId, "field"), fname);
    fs.writeFileSync(full, Buffer.from(input.imageBase64, "base64"));
    photoPath = path.join(projectId, "field", fname).replace(/\\/g, "/");
  } else {
    photoPath = `_memo:${id}`;
  }

  getDatabase()
    .prepare(
      `INSERT INTO survey_photos (id, project_id, photo_type, photo_path, comment, taken_at, uploaded_by, created_at)
       VALUES (?, ?, 'field', ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      id,
      projectId,
      photoPath,
      input.comment?.trim() ?? null,
      takenAt,
      input.uploadedBy ?? null
    );
  getDatabase()
    .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
    .run(now, projectId);
  return rowToPhoto({
    id,
    photo_type: "field",
    photo_path: photoPath,
    comment: input.comment?.trim() ?? null,
    taken_at: takenAt,
    uploaded_by: input.uploadedBy ?? null,
    created_at: now,
  });
}

export function listSurveyMaterialsV1(projectId: string): SurveyMaterialV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM survey_materials WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map(rowToMaterial);
}

export function addSurveyMaterialV1(
  projectId: string,
  input: {
    category: string;
    itemLabel?: string;
    quantity?: number;
    memo?: string;
  }
): SurveyMaterialV1 {
  if (!getSurveyProjectV1(projectId)) throw new Error("project not found");
  if (!isMaterialCategory(input.category)) throw new Error("invalid category");
  const id = uuid();
  const now = new Date().toISOString();
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const sortRow = getDatabase()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM survey_materials WHERE project_id = ?`)
    .get(projectId) as { n: number };
  getDatabase()
    .prepare(
      `INSERT INTO survey_materials (id, project_id, category, item_label, quantity, memo, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      projectId,
      input.category,
      input.itemLabel?.trim() ?? "",
      qty,
      input.memo?.trim() ?? "",
      sortRow.n,
      now,
      now
    );
  getDatabase()
    .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
    .run(now, projectId);
  return rowToMaterial({
    id,
    project_id: projectId,
    category: input.category,
    item_label: input.itemLabel ?? "",
    quantity: qty,
    memo: input.memo ?? "",
    sort_order: sortRow.n,
    created_at: now,
    updated_at: now,
  });
}

export function updateWorkflowStatusV1(
  projectId: string,
  workflowStatus: SurveyWorkflowStatus
): SurveyProjectV1 | null {
  if (!isWorkflowStatus(workflowStatus)) throw new Error("invalid workflow_status");
  return updateSurveyProjectV1(projectId, { workflowStatus });
}

export function markEstimatePendingV1(
  projectId: string,
  handoffBy?: string
): { project: SurveyProjectV1; handoff: SurveyHandoffLogV1 } {
  const detail = getSurveyProjectV1Detail(projectId);
  if (!detail) throw new Error("project not found");

  const project = updateWorkflowStatusV1(projectId, "estimate_pending")!;
  const payload = {
    phase: "v1_entry_only",
    customerName: project.customerName,
    materialCount: detail.materials.length,
    photoCount: detail.photos.length,
    handedOffAt: new Date().toISOString(),
  };

  const existing = getDatabase()
    .prepare(`SELECT id FROM survey_handoff_log WHERE survey_project_id = ?`)
    .get(projectId) as { id: string } | undefined;

  const handoffId = existing?.id ?? uuid();
  const businessProjectId = "";

  if (existing) {
    getDatabase()
      .prepare(
        `UPDATE survey_handoff_log SET
          handoff_by = ?, handoff_at = datetime('now'), payload_json = ?
         WHERE survey_project_id = ?`
      )
      .run(handoffBy ?? null, JSON.stringify(payload), projectId);
  } else {
    getDatabase()
      .prepare(
        `INSERT INTO survey_handoff_log (id, survey_project_id, business_project_id, handoff_by, handoff_at, payload_json)
         VALUES (?, ?, ?, ?, datetime('now'), ?)`
      )
      .run(handoffId, projectId, businessProjectId, handoffBy ?? null, JSON.stringify(payload));
  }

  const handoffRow = getDatabase()
    .prepare(`SELECT * FROM survey_handoff_log WHERE survey_project_id = ?`)
    .get(projectId) as Record<string, unknown>;

  return {
    project,
    handoff: {
      id: String(handoffRow.id),
      surveyProjectId: String(handoffRow.survey_project_id),
      businessProjectId: String(handoffRow.business_project_id),
      handoffBy: handoffRow.handoff_by != null ? String(handoffRow.handoff_by) : null,
      handoffAt: String(handoffRow.handoff_at),
      payloadJson: parsePayload(handoffRow.payload_json as string),
    },
  };
}
