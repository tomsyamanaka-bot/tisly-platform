/**
 * 案件 PDF 自動再生成フラグ（project_pdf_stale）
 */
import { getDatabase } from "../db/database.js";

export type PracticalDocKind = "estimate" | "invoice" | "specification" | "completion";

export function markProjectPdfStaleV1(
  projectId: string,
  kinds: PracticalDocKind | PracticalDocKind[] | "all"
): void {
  const list: PracticalDocKind[] =
    kinds === "all"
      ? ["estimate", "invoice", "specification", "completion"]
      : Array.isArray(kinds)
        ? kinds
        : [kinds];
  const now = new Date().toISOString();
  const stmt = getDatabase().prepare(
    `INSERT INTO project_pdf_stale (project_id, kind, stale_at)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id, kind) DO UPDATE SET stale_at = excluded.stale_at`
  );
  for (const kind of list) {
    stmt.run(projectId, kind, now);
  }
}

export function clearProjectPdfStaleV1(projectId: string, kind: PracticalDocKind): void {
  getDatabase()
    .prepare(`DELETE FROM project_pdf_stale WHERE project_id = ? AND kind = ?`)
    .run(projectId, kind);
}

export function isProjectPdfStaleV1(projectId: string, kind: PracticalDocKind): boolean {
  const row = getDatabase()
    .prepare(`SELECT 1 FROM project_pdf_stale WHERE project_id = ? AND kind = ?`)
    .get(projectId, kind);
  return Boolean(row);
}
