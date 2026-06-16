/**
 * PDF / LINE 共有ログ — 日時・案件ID・書類種類・ファイル名
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { recordPdfShareTimelineV1 } from "./project-timeline-v1-store.js";

export interface PdfShareLogRowV1 {
  id: string;
  projectId: string;
  documentKind: string;
  fileName: string;
  sharedAt: string;
}

export function recordPdfShareLogV1(input: {
  projectId: string;
  documentKind: string;
  fileName: string;
}): PdfShareLogRowV1 {
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO pdf_share_logs (id, project_id, document_kind, file_name, shared_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, input.projectId, input.documentKind, input.fileName, now);
  recordPdfShareTimelineV1(input.projectId, input.documentKind, input.fileName);
  return { id, projectId: input.projectId, documentKind: input.documentKind, fileName: input.fileName, sharedAt: now };
}

export function listPdfShareLogsForProjectV1(projectId: string, limit = 50): PdfShareLogRowV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, project_id, document_kind, file_name, shared_at
       FROM pdf_share_logs WHERE project_id = ? ORDER BY shared_at DESC LIMIT ?`
    )
    .all(projectId, limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    documentKind: String(r.document_kind),
    fileName: String(r.file_name),
    sharedAt: String(r.shared_at),
  }));
}
