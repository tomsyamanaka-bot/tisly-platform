/**
 * 案件 PDF 初回自動保存 — 仕様書 / 完了報告書
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  getBusinessProject,
  getCompletionReport,
  setCompletionReportPdfPath,
  updateBusinessProject,
} from "../business/business-store.js";
import { generateCompletionReportPdfV1 } from "../business/services/pdfService.js";
import {
  generateAndSaveSpecificationPdfV1,
  renderCompletionReportHtmlV1,
} from "../estimate/estimate-v1-store.js";
import { buildWorkContentSummary } from "../field-ops/work-session-v1-store.js";
import { getProjectPdfMeta, recordProjectPdfSavedV1 } from "./project-pdf-qnap-store.js";
import { resolveProjectPdfFile } from "./project-pdf-store.js";
import { processQnapPdfBackupRow } from "../storage/qnap-pdf-backup-service.js";

function localPdfExists(projectId: string, kind: "specification" | "report"): boolean {
  const file = resolveProjectPdfFile(projectId, kind);
  return Boolean(file && fs.existsSync(file));
}

export async function maybeAutoSaveSpecificationPdfV1(
  businessProjectId: string
): Promise<string | null> {
  if (localPdfExists(businessProjectId, "specification")) {
    const meta = getProjectPdfMeta(businessProjectId, "specification");
    return meta?.localPath ?? null;
  }
  const pdfPath = await generateAndSaveSpecificationPdfV1(businessProjectId);
  if (!pdfPath) return null;
  const meta = getProjectPdfMeta(businessProjectId, "specification");
  if (meta?.qnapBackupEnabled && meta.qnapBackupStatus === "pending") {
    await processQnapPdfBackupRow(meta);
  }
  return pdfPath;
}

function ensureCompletionReportRecord(businessProjectId: string): string {
  const project = getBusinessProject(businessProjectId);
  if (!project) throw new Error("project not found");
  if (project.completionReportId) return project.completionReportId;
  const id = uuid();
  const now = new Date().toISOString();
  const ref = { source: "business" as const, projectId: businessProjectId };
  getDatabase()
    .prepare(
      `INSERT INTO business_completion_reports (
        id, project_id, title, before_photos_json, after_photos_json, work_memo, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, '[]', '[]', ?, NULL, ?, ?)`
    )
    .run(
      id,
      businessProjectId,
      `${project.title} 完了報告`,
      buildWorkContentSummary(ref),
      now,
      now
    );
  updateBusinessProject(businessProjectId, { completionReportId: id });
  return id;
}

export async function autoSaveCompletionReportPdfV1(
  businessProjectId: string
): Promise<string | null> {
  if (localPdfExists(businessProjectId, "report")) {
    const meta = getProjectPdfMeta(businessProjectId, "report");
    return meta?.localPath ?? null;
  }
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;
  const reportId = ensureCompletionReportRecord(businessProjectId);
  const html = renderCompletionReportHtmlV1(businessProjectId);
  if (!html) return null;
  const rep = getCompletionReport(reportId);
  const suffix = rep?.title?.slice(0, 24) ?? businessProjectId.slice(-4);
  const refreshed = getBusinessProject(businessProjectId)!;
  const pdfPath = await generateCompletionReportPdfV1(refreshed, html, suffix);
  setCompletionReportPdfPath(reportId, pdfPath);
  recordProjectPdfSavedV1(businessProjectId, "report", pdfPath);
  const meta = getProjectPdfMeta(businessProjectId, "report");
  if (meta?.qnapBackupEnabled && meta.qnapBackupStatus === "pending") {
    await processQnapPdfBackupRow(meta);
  }
  return pdfPath;
}

export function findBusinessProjectIdForSurvey(surveyProjectId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT id FROM business_projects WHERE survey_project_id = ? AND deleted_at IS NULL LIMIT 1`)
    .get(surveyProjectId) as { id: string } | undefined;
  if (row?.id) return row.id;
  const handoff = getDatabase()
    .prepare(`SELECT business_project_id FROM survey_handoff_log WHERE survey_project_id = ?`)
    .get(surveyProjectId) as { business_project_id?: string } | undefined;
  const id = handoff?.business_project_id?.trim();
  return id || null;
}
