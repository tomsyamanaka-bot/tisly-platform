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
  createdAt: string;
  updatedAt: string;
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
    createdAt: now,
    updatedAt: now,
  };
}

export function getMasterV1EstimateDraft(id: string): MasterV1EstimateDraft | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_estimate_drafts WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
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
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
