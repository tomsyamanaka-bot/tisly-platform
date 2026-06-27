import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  SURVEY_MATERIAL_CATEGORIES,
  SURVEY_WORK_TYPES,
  SURVEY_WORKFLOW_STATUSES,
  type SurveyMaterialCategory,
  type SurveyMaterialV1,
  type SurveyIpEquipmentV1,
  type SurveyPhotoV1,
  type SurveyProjectV1,
  type SurveyWorkType,
  type SurveyWorkflowStatus,
} from "./survey-v1-types.js";
import { surveyUploadsDir } from "./survey-store.js";
import { syncProjectStatusAutoBySurveyV1 } from "../projects/project-status-auto-v1.js";

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
  ipEquipment: SurveyIpEquipmentV1[];
  handoff: SurveyHandoffLogV1 | null;
}

function isWorkflowStatus(v: string): v is SurveyWorkflowStatus {
  return (SURVEY_WORKFLOW_STATUSES as readonly string[]).includes(v);
}

function isMaterialCategory(v: string): v is SurveyMaterialCategory {
  return (SURVEY_MATERIAL_CATEGORIES as readonly string[]).includes(v);
}

function isWorkType(v: string): v is SurveyWorkType {
  return (SURVEY_WORK_TYPES as readonly string[]).includes(v);
}

function parseWorkTypes(raw: unknown): SurveyWorkType[] {
  if (!raw) return [];
  let arr: unknown[] = [];
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw) as unknown[];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }
  return arr.filter((v): v is SurveyWorkType => typeof v === "string" && isWorkType(v));
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
    customerAddress: r.customer_address != null ? String(r.customer_address) : null,
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
    workTypes: parseWorkTypes(r.work_types_json),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToPhoto(r: Record<string, unknown>): SurveyPhotoV1 {
  const photoPath = String(r.photo_path);
  const comment = r.comment != null ? String(r.comment) : null;
  return {
    id: String(r.id),
    photoType: String(r.photo_type),
    photoPath,
    url: photoPath.startsWith("_memo:") ? "" : `/uploads/survey/${photoPath}`,
    comment,
    title: comment,
    takenAt: r.taken_at != null ? String(r.taken_at) : null,
    uploadedBy: r.uploaded_by != null ? String(r.uploaded_by) : null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
  };
}

const SURVEY_PHOTO_SELECT =
  `id, photo_type, photo_path, comment, taken_at, uploaded_by, sort_order, datetime(created_at) as created_at`;

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

function rowToIpEquipment(
  r: Record<string, unknown>,
  opts?: { includePassword?: boolean }
): SurveyIpEquipmentV1 {
  const item: SurveyIpEquipmentV1 = {
    id: String(r.id),
    projectId: String(r.project_id),
    deviceName: String(r.device_name ?? ""),
    deviceType: String(r.device_type ?? ""),
    location: String(r.location ?? ""),
    ipAddress: String(r.ip_address ?? ""),
    loginId: String(r.login_id ?? ""),
    memo: String(r.memo ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
  if (opts?.includePassword) {
    item.password = String(r.password ?? "");
  }
  return item;
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

/**
 * 現調メモへ行を追記
 * （OCR 等 — 既存メモは保持）
 */
export function appendSurveyProjectNotesV1(projectId: string, lines: string[]): string {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  if (!trimmed.length) return getProjectNotes(projectId) ?? "";
  const existing = getProjectNotes(projectId)?.trim() ?? "";
  const block = trimmed.join("\n");
  const merged = existing ? `${existing}\n${block}` : block;
  saveProjectNotes(projectId, merged);
  return merged;
}

function withProjectNotes(project: SurveyProjectV1): SurveyProjectV1 {
  return { ...project, notes: getProjectNotes(project.projectId) };
}

export function listSurveyProjectsV1(opts?: {
  customerCode?: string;
  workflowStatus?: SurveyWorkflowStatus;
  includeDeleted?: boolean;
}): SurveyProjectV1[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!opts?.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }
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
  customerAddress?: string;
  siteName?: string;
  address?: string;
  phone?: string;
  email?: string;
  surveyDate?: string;
  assignee?: string;
  notes?: string;
  projectNo?: string;
  workTypes?: SurveyWorkType[];
}): SurveyProjectV1 {
  const projectId = `SVY-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const siteName = input.siteName?.trim() || input.customerName.trim();
  const projectNo = input.projectNo?.trim() || nextProjectNo();
  getDatabase()
    .prepare(
      `INSERT INTO survey_projects (
        project_id, project_no, customer_code, customer_name, customer_address, site_name,
        address, phone, email, survey_date, assignee,
        status, workflow_status, work_types_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'surveying', ?, ?, ?)`
    )
    .run(
      projectId,
      projectNo,
      input.customerCode.toUpperCase(),
      input.customerName.trim(),
      input.customerAddress?.trim() ?? null,
      siteName,
      input.address?.trim() ?? null,
      input.phone?.trim() ?? null,
      input.email?.trim() ?? null,
      input.surveyDate ?? null,
      input.assignee?.trim() ?? null,
      JSON.stringify(parseWorkTypes(input.workTypes)),
      now,
      now
    );
  if (input.notes !== undefined && input.notes !== null) {
    saveProjectNotes(projectId, String(input.notes).trim());
  }
  return withProjectNotes(getSurveyProjectV1(projectId)!);
}

export function getSurveyProjectV1(projectId: string, opts?: { includeDeleted?: boolean }): SurveyProjectV1 | null {
  const deletedClause = opts?.includeDeleted ? "" : " AND deleted_at IS NULL";
  const row = getDatabase()
    .prepare(`SELECT * FROM survey_projects WHERE project_id = ?${deletedClause}`)
    .get(projectId) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export function getSurveyProjectV1Detail(projectId: string): SurveyProjectV1Detail | null {
  const project = getSurveyProjectV1(projectId);
  if (!project) return null;
  const photos = listSurveyPhotosV1(projectId);
  const materials = listSurveyMaterialsV1(projectId);
  const ipEquipment = listSurveyIpEquipmentV1(projectId);
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
    ipEquipment,
    handoff,
  };
}

export function updateSurveyProjectV1(
  projectId: string,
  patch: Partial<{
    customerName: string;
    customerAddress: string;
    siteName: string;
    address: string;
    phone: string;
    email: string;
    surveyDate: string;
    assignee: string;
    notes: string;
    workflowStatus: SurveyWorkflowStatus;
    workTypes: SurveyWorkType[];
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
        customer_name = ?, customer_address = ?, site_name = ?, address = ?, phone = ?, email = ?,
        survey_date = ?, assignee = ?,
        workflow_status = COALESCE(?, workflow_status),
        work_types_json = COALESCE(?, work_types_json),
        updated_at = ?
       WHERE project_id = ?`
    )
    .run(
      patch.customerName ?? existing.customerName,
      patch.customerAddress !== undefined ? patch.customerAddress : existing.customerAddress,
      patch.siteName ?? existing.siteName,
      patch.address !== undefined ? patch.address : existing.address,
      patch.phone !== undefined ? patch.phone : existing.phone,
      patch.email !== undefined ? patch.email : existing.email,
      patch.surveyDate !== undefined ? patch.surveyDate : existing.surveyDate,
      patch.assignee !== undefined ? patch.assignee : existing.assignee,
      patch.workflowStatus ?? null,
      patch.workTypes !== undefined ? JSON.stringify(parseWorkTypes(patch.workTypes)) : null,
      now,
      projectId
    );
  if (patch.notes !== undefined) {
    saveProjectNotes(projectId, String(patch.notes).trim());
  }
  const updated = getSurveyProjectV1(projectId);
  const result = updated ? withProjectNotes(updated) : null;
  if (result) syncProjectStatusAutoBySurveyV1(projectId, "survey_saved");
  return result;
}

export function listSurveyPhotosV1(projectId: string): SurveyPhotoV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT ${SURVEY_PHOTO_SELECT}
       FROM survey_photos WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC`
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map(rowToPhoto);
}

const MAX_SURVEY_PHOTOS_V1 = 30;

function nextSurveyPhotoSortOrder(projectId: string): number {
  const sortRow = getDatabase()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM survey_photos WHERE project_id = ?`)
    .get(projectId) as { n: number };
  return sortRow?.n ?? 0;
}

export function addSurveyPhotoMemoV1(
  projectId: string,
  input: {
    comment?: string;
    imageBase64?: string;
    fileName?: string;
    takenAt?: string;
    uploadedBy?: string;
    sortOrder?: number;
  }
): SurveyPhotoV1 {
  if (!getSurveyProjectV1(projectId)) throw new Error("project not found");
  if (input.imageBase64) {
    const countRow = getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM survey_photos WHERE project_id = ? AND photo_path NOT LIKE '_memo:%'`
      )
      .get(projectId) as { c: number };
    if ((countRow?.c ?? 0) >= MAX_SURVEY_PHOTOS_V1) {
      throw new Error("photo limit reached (max 30)");
    }
  }
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

  const sortOrder = input.sortOrder ?? nextSurveyPhotoSortOrder(projectId);
  getDatabase()
    .prepare(
      `INSERT INTO survey_photos (id, project_id, photo_type, photo_path, comment, taken_at, uploaded_by, sort_order, created_at)
       VALUES (?, ?, 'field', ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      id,
      projectId,
      photoPath,
      input.comment?.trim() ?? null,
      takenAt,
      input.uploadedBy ?? null,
      sortOrder
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
    sort_order: sortOrder,
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

export function listSurveyIpEquipmentV1(
  projectId: string,
  opts?: { includePassword?: boolean }
): SurveyIpEquipmentV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM survey_ip_equipment WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => rowToIpEquipment(r, opts));
}

export function addSurveyIpEquipmentV1(
  projectId: string,
  input: {
    deviceName?: string;
    deviceType?: string;
    location?: string;
    ipAddress?: string;
    loginId?: string;
    password?: string;
    memo?: string;
  }
): SurveyIpEquipmentV1 {
  if (!getSurveyProjectV1(projectId)) throw new Error("project not found");
  const id = uuid();
  const now = new Date().toISOString();
  const sortRow = getDatabase()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM survey_ip_equipment WHERE project_id = ?`)
    .get(projectId) as { n: number };
  getDatabase()
    .prepare(
      `INSERT INTO survey_ip_equipment (
        id, project_id, device_name, device_type, location, ip_address, login_id, password, memo, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      projectId,
      input.deviceName?.trim() ?? "",
      input.deviceType?.trim() ?? "",
      input.location?.trim() ?? "",
      input.ipAddress?.trim() ?? "",
      input.loginId?.trim() ?? "",
      input.password?.trim() ?? "",
      input.memo?.trim() ?? "",
      sortRow.n,
      now,
      now
    );
  getDatabase()
    .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
    .run(now, projectId);
  return rowToIpEquipment(
    getDatabase().prepare(`SELECT * FROM survey_ip_equipment WHERE id = ?`).get(id) as Record<
      string,
      unknown
    >,
    { includePassword: true }
  );
}

export function updateSurveyIpEquipmentV1(
  projectId: string,
  itemId: string,
  patch: {
    deviceName?: string;
    deviceType?: string;
    location?: string;
    ipAddress?: string;
    loginId?: string;
    password?: string;
    memo?: string;
  }
): SurveyIpEquipmentV1 | null {
  if (!getSurveyProjectV1(projectId)) return null;
  const row = getDatabase()
    .prepare(`SELECT * FROM survey_ip_equipment WHERE id = ? AND project_id = ?`)
    .get(itemId, projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const now = new Date().toISOString();
  const next = {
    deviceName: patch.deviceName !== undefined ? patch.deviceName.trim() : String(row.device_name ?? ""),
    deviceType: patch.deviceType !== undefined ? patch.deviceType.trim() : String(row.device_type ?? ""),
    location: patch.location !== undefined ? patch.location.trim() : String(row.location ?? ""),
    ipAddress: patch.ipAddress !== undefined ? patch.ipAddress.trim() : String(row.ip_address ?? ""),
    loginId: patch.loginId !== undefined ? patch.loginId.trim() : String(row.login_id ?? ""),
    password: patch.password !== undefined ? patch.password.trim() : String(row.password ?? ""),
    memo: patch.memo !== undefined ? patch.memo.trim() : String(row.memo ?? ""),
  };
  getDatabase()
    .prepare(
      `UPDATE survey_ip_equipment SET
        device_name = ?, device_type = ?, location = ?, ip_address = ?, login_id = ?, password = ?, memo = ?, updated_at = ?
       WHERE id = ? AND project_id = ?`
    )
    .run(
      next.deviceName,
      next.deviceType,
      next.location,
      next.ipAddress,
      next.loginId,
      next.password,
      next.memo,
      now,
      itemId,
      projectId
    );
  getDatabase()
    .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
    .run(now, projectId);
  return rowToIpEquipment(
    getDatabase().prepare(`SELECT * FROM survey_ip_equipment WHERE id = ?`).get(itemId) as Record<
      string,
      unknown
    >,
    { includePassword: true }
  );
}

export function deleteSurveyIpEquipmentV1(projectId: string, itemId: string): boolean {
  if (!getSurveyProjectV1(projectId)) return false;
  const result = getDatabase()
    .prepare(`DELETE FROM survey_ip_equipment WHERE id = ? AND project_id = ?`)
    .run(itemId, projectId);
  if (result.changes) {
    getDatabase()
      .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
      .run(new Date().toISOString(), projectId);
  }
  return result.changes > 0;
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

export function updateSurveyPhotoV1(
  projectId: string,
  photoId: string,
  patch: { title?: string; comment?: string; imageBase64?: string; fileName?: string }
): SurveyPhotoV1 | null {
  if (!getSurveyProjectV1(projectId)) return null;
  const row = getDatabase()
    .prepare(`SELECT id, photo_path FROM survey_photos WHERE id = ? AND project_id = ?`)
    .get(photoId, projectId) as { id: string; photo_path: string } | undefined;
  if (!row) return null;
  const photoPath = String(row.photo_path);
  if (photoPath.startsWith("_memo:")) return null;

  if (patch.imageBase64) {
    const full = path.join(process.cwd(), "uploads", "survey", photoPath);
    const ext = path.extname(patch.fileName ?? photoPath) || ".jpg";
    const outExt = ext.toLowerCase() === ".png" ? ".png" : ".jpg";
    const buf = Buffer.from(patch.imageBase64, "base64");
    if (!buf.length) throw new Error("empty image data");
    const dir = path.dirname(full);
    fs.mkdirSync(dir, { recursive: true });
    const baseName = path.basename(photoPath, path.extname(photoPath));
    const newRel = path.join(path.dirname(photoPath), `${baseName}${outExt}`).replace(/\\/g, "/");
    const newFull = path.join(process.cwd(), "uploads", "survey", newRel);
    fs.writeFileSync(newFull, buf);
    if (newFull !== full && fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
    if (newRel !== photoPath) {
      getDatabase()
        .prepare(`UPDATE survey_photos SET photo_path = ? WHERE id = ? AND project_id = ?`)
        .run(newRel, photoId, projectId);
    }
  }

  const title =
    patch.title !== undefined || patch.comment !== undefined
      ? (patch.title ?? patch.comment)?.trim() || null
      : undefined;
  if (title !== undefined) {
    getDatabase()
      .prepare(`UPDATE survey_photos SET comment = ? WHERE id = ? AND project_id = ?`)
      .run(title, photoId, projectId);
  }
  getDatabase()
    .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
    .run(new Date().toISOString(), projectId);
  const updated = getDatabase()
    .prepare(`SELECT ${SURVEY_PHOTO_SELECT} FROM survey_photos WHERE id = ?`)
    .get(photoId) as Record<string, unknown>;
  return rowToPhoto(updated);
}

export function moveSurveyPhotoV1(
  projectId: string,
  photoId: string,
  direction: "up" | "down"
): SurveyPhotoV1[] | null {
  if (!getSurveyProjectV1(projectId)) return null;
  const photos = listSurveyPhotosV1(projectId);
  const idx = photos.findIndex((p) => p.id === photoId);
  if (idx < 0) return null;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= photos.length) return photos;

  const current = photos[idx]!;
  const neighbor = photos[swapIdx]!;
  const db = getDatabase();
  db.prepare(`UPDATE survey_photos SET sort_order = ? WHERE id = ? AND project_id = ?`).run(
    neighbor.sortOrder,
    current.id,
    projectId
  );
  db.prepare(`UPDATE survey_photos SET sort_order = ? WHERE id = ? AND project_id = ?`).run(
    current.sortOrder,
    neighbor.id,
    projectId
  );
  db.prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`).run(
    new Date().toISOString(),
    projectId
  );
  return listSurveyPhotosV1(projectId);
}

export function deleteSurveyPhotoV1(projectId: string, photoId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT photo_path FROM survey_photos WHERE id = ? AND project_id = ?`)
    .get(photoId, projectId) as { photo_path: string } | undefined;
  if (!row) return false;

  const photoPath = String(row.photo_path);
  if (!photoPath.startsWith("_memo:")) {
    const full = path.join(process.cwd(), "uploads", "survey", photoPath);
    if (fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  }

  getDatabase()
    .prepare(`DELETE FROM survey_photos WHERE id = ? AND project_id = ?`)
    .run(photoId, projectId);
  getDatabase()
    .prepare(`UPDATE survey_projects SET updated_at = ? WHERE project_id = ?`)
    .run(new Date().toISOString(), projectId);
  return true;
}

export function copySurveyProjectV1(projectId: string): SurveyProjectV1 {
  const detail = getSurveyProjectV1Detail(projectId);
  if (!detail) throw new Error("project not found");

  const copied = createSurveyProjectV1({
    customerCode: detail.customerCode,
    customerName: detail.customerName,
    customerAddress: detail.customerAddress ?? undefined,
    siteName: detail.siteName,
    address: detail.address ?? undefined,
    phone: detail.phone ?? undefined,
    email: detail.email ?? undefined,
    surveyDate: detail.surveyDate ?? undefined,
    assignee: detail.assignee ?? undefined,
    notes: detail.notes ?? undefined,
  });

  for (const m of detail.materials) {
    addSurveyMaterialV1(copied.projectId, {
      category: m.category,
      itemLabel: m.itemLabel,
      quantity: m.quantity,
      memo: m.memo,
    });
  }

  for (const ph of detail.photos) {
    if (ph.photoPath.startsWith("_memo:")) {
      addSurveyPhotoMemoV1(copied.projectId, {
        comment: ph.comment ?? undefined,
        takenAt: ph.takenAt ?? undefined,
        sortOrder: ph.sortOrder,
      });
      continue;
    }
    const src = path.join(process.cwd(), "uploads", "survey", ph.photoPath);
    if (!fs.existsSync(src)) continue;
    const buf = fs.readFileSync(src);
    addSurveyPhotoMemoV1(copied.projectId, {
      comment: ph.comment ?? undefined,
      imageBase64: buf.toString("base64"),
      fileName: path.basename(ph.photoPath),
      takenAt: ph.takenAt ?? undefined,
      sortOrder: ph.sortOrder,
    });
  }

  return getSurveyProjectV1(copied.projectId)!;
}

export function deleteSurveyProjectV1(projectId: string): boolean {
  const existing = getSurveyProjectV1(projectId);
  if (!existing) return false;
  const now = new Date().toISOString();
  const result = getDatabase()
    .prepare(`UPDATE survey_projects SET deleted_at = ?, updated_at = ? WHERE project_id = ? AND deleted_at IS NULL`)
    .run(now, now, projectId);
  return result.changes > 0;
}

export function getSurveyDeletePreviewV1(projectId: string): {
  projectId: string;
  siteName: string;
  linkedEstimate: boolean;
  warning?: string;
} | null {
  const project = getSurveyProjectV1(projectId);
  if (!project) return null;
  const handoff = getDatabase()
    .prepare(`SELECT business_project_id FROM survey_handoff_log WHERE survey_project_id = ?`)
    .get(projectId) as { business_project_id?: string } | undefined;
  const linkedEstimate = Boolean(handoff?.business_project_id);
  return {
    projectId,
    siteName: project.siteName,
    linkedEstimate,
    warning: linkedEstimate ? "削除すると見積側の参照が残ります" : undefined,
  };
}

export function listDeletedSurveyProjectsV1(limit = 50): SurveyProjectV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM survey_projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToProject);
}

export function restoreSurveyProjectV1(projectId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT project_id, deleted_at FROM survey_projects WHERE project_id = ?`)
    .get(projectId) as { project_id: string; deleted_at: string | null } | undefined;
  if (!row?.deleted_at) return false;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(`UPDATE survey_projects SET deleted_at = NULL, updated_at = ? WHERE project_id = ?`)
    .run(now, projectId);
  return true;
}
