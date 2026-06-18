import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { MasterV1EstimatePreviewEnriched } from "./master-v1-types.js";

export interface MasterV1EstimateDraft {
  id: string;
  projectId: string | null;
  sketchId: string | null;
  customerId: string | null;
  preview: MasterV1EstimatePreviewEnriched;
  status: "draft" | "applied";
  businessProjectId: string | null;
  estimateId: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToDraft(row: Record<string, unknown>): MasterV1EstimateDraft | null {
  let preview: MasterV1EstimatePreviewEnriched;
  try {
    preview = JSON.parse(String(row.payload_json)) as MasterV1EstimatePreviewEnriched;
  } catch {
    return null;
  }
  return {
    id: String(row.id),
    projectId: row.project_id != null ? String(row.project_id) : null,
    sketchId: row.sketch_id != null ? String(row.sketch_id) : null,
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    preview,
    status: row.status === "applied" ? "applied" : "draft",
    businessProjectId:
      row.business_project_id != null ? String(row.business_project_id) : null,
    estimateId: row.estimate_id != null ? String(row.estimate_id) : null,
    appliedAt: row.applied_at != null ? String(row.applied_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function saveMasterV1EstimateDraft(input: {
  projectId?: string | null;
  sketchId?: string | null;
  customerId?: string | null;
  preview: MasterV1EstimatePreviewEnriched;
}): MasterV1EstimateDraft {
  const id = uuid();
  const now = nowIso();
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_estimate_drafts (
        id, project_id, sketch_id, customer_id, payload_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(
      id,
      input.projectId ?? null,
      input.sketchId ?? null,
      input.customerId ?? null,
      JSON.stringify(input.preview),
      now,
      now
    );
  return {
    id,
    projectId: input.projectId ?? null,
    sketchId: input.sketchId ?? null,
    customerId: input.customerId ?? null,
    preview: input.preview,
    status: "draft",
    businessProjectId: null,
    estimateId: null,
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getMasterV1EstimateDraft(id: string): MasterV1EstimateDraft | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_estimate_drafts WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToDraft(row);
}

export function getLatestMasterV1EstimateDraftBySketch(
  sketchId: string
): MasterV1EstimateDraft | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM master_v1_estimate_drafts WHERE sketch_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .get(sketchId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToDraft(row);
}

export function markMasterV1EstimateDraftApplied(
  id: string,
  businessProjectId: string,
  estimateId: string
): MasterV1EstimateDraft | null {
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_estimate_drafts SET
        status = 'applied',
        business_project_id = ?,
        estimate_id = ?,
        applied_at = ?,
        updated_at = ?
       WHERE id = ?`
    )
    .run(businessProjectId, estimateId, now, now, id);
  return getMasterV1EstimateDraft(id);
}
