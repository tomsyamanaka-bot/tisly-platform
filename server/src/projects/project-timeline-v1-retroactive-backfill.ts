/** 案件タイムライン v1 — is_backfill 遡及付与（migrate 用・循環 import 回避） */
import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { projectStorageProjectDir } from "../storage/project-storage-provider.js";

interface BackfillDraft {
  eventType: string;
  title: string;
  description: string;
  createdAt: string;
}

const SHARE_KIND_LABELS: Record<string, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  completion: "完了報告書",
  "completion-report": "完了報告書",
  report: "完了報告書",
};

const LEGACY_EVENT_MAP: Record<string, { eventType: string; title: string }> = {
  project_created: { eventType: "project_created", title: "案件作成" },
  survey: { eventType: "survey_created", title: "現調" },
  drawing: { eventType: "drawing_added", title: "図面追加" },
  ai_estimate: { eventType: "estimate_created", title: "AI見積" },
  estimate_sent: { eventType: "estimate_pdf_saved", title: "見積送信" },
  construction_start: { eventType: "status_changed", title: "施工開始" },
  construction_complete: { eventType: "status_changed", title: "施工完了" },
  completion_report: { eventType: "completion_saved", title: "完了報告" },
  invoice: { eventType: "invoice_created", title: "請求" },
  payment: { eventType: "status_changed", title: "入金" },
};

const PDF_KIND_EVENT: Record<string, { save: string; saveTitle: string }> = {
  estimate: { save: "estimate_pdf_saved", saveTitle: "見積PDF保存" },
  invoice: { save: "invoice_pdf_saved", saveTitle: "請求PDF保存" },
  specification: { save: "specification_saved", saveTitle: "仕様書保存" },
  report: { save: "completion_saved", saveTitle: "完了報告書保存" },
};

function dedupeKey(d: BackfillDraft): string {
  return `${d.eventType}|${d.createdAt.slice(0, 19)}|${d.title}|${d.description}`;
}

function collectStorageFileEvents(projectNo: string): BackfillDraft[] {
  const drafts: BackfillDraft[] = [];
  const localRoot = projectStorageProjectDir(projectNo);
  const folders: Array<{ folder: string; eventType: string; title: string }> = [
    { folder: "06_写真", eventType: "photo_added", title: "写真追加" },
    { folder: "07_図面", eventType: "drawing_added", title: "図面追加" },
  ];
  for (const { folder, eventType, title } of folders) {
    const dir = path.join(localRoot, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      drafts.push({ eventType, title, description: name, createdAt: stat.mtime.toISOString() });
    }
  }
  return drafts;
}

function collectBackfillDraftKeys(database: Database.Database, projectId: string): Set<string> {
  const project = database
    .prepare(
      `SELECT project_no, title, created_at, survey_project_id FROM business_projects WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!project) return new Set();

  const seen = new Set<string>();
  const drafts: BackfillDraft[] = [];
  const push = (d: BackfillDraft) => {
    const key = dedupeKey(d);
    if (seen.has(key)) return;
    seen.add(key);
    drafts.push(d);
  };

  push({
    eventType: "project_created",
    title: "案件作成",
    description: `${project.project_no} ${project.title}`,
    createdAt: String(project.created_at),
  });
  if (project.survey_project_id) {
    push({
      eventType: "survey_created",
      title: "現調作成",
      description: String(project.survey_project_id),
      createdAt: String(project.created_at),
    });
  }

  const estimates = database
    .prepare(
      `SELECT estimate_no, pdf_path, created_at, updated_at FROM business_estimates WHERE project_id = ? ORDER BY created_at ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const e of estimates) {
    push({
      eventType: "estimate_created",
      title: "見積書作成",
      description: String(e.estimate_no),
      createdAt: String(e.created_at),
    });
    if (e.pdf_path) {
      push({
        eventType: "estimate_pdf_saved",
        title: "見積PDF保存",
        description: String(e.estimate_no),
        createdAt: String(e.updated_at ?? e.created_at),
      });
    }
  }

  const invoices = database
    .prepare(
      `SELECT invoice_no, pdf_path, created_at, updated_at FROM business_invoices WHERE project_id = ? ORDER BY created_at ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const inv of invoices) {
    push({
      eventType: "invoice_created",
      title: "請求書作成",
      description: String(inv.invoice_no),
      createdAt: String(inv.created_at),
    });
    if (inv.pdf_path) {
      push({
        eventType: "invoice_pdf_saved",
        title: "請求PDF保存",
        description: String(inv.invoice_no),
        createdAt: String(inv.updated_at ?? inv.created_at),
      });
    }
  }

  const pdfRows = database
    .prepare(
      `SELECT kind, file_name, created_at, updated_at FROM project_pdf_meta
       WHERE project_id = ? AND deleted_at IS NULL AND local_path != ''`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const p of pdfRows) {
    const kind = String(p.kind);
    const spec = PDF_KIND_EVENT[kind];
    if (!spec) continue;
    push({
      eventType: spec.save,
      title: spec.saveTitle,
      description: String(p.file_name ?? `${kind}.pdf`),
      createdAt: String(p.updated_at ?? p.created_at),
    });
  }

  const qnapRows = database
    .prepare(
      `SELECT file_name, qnap_backup_path, qnap_backup_completed_at FROM project_pdf_meta
       WHERE project_id = ? AND deleted_at IS NULL
         AND qnap_backup_status = 'success' AND qnap_backup_completed_at IS NOT NULL`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const q of qnapRows) {
    const fileName = String(q.file_name ?? "document.pdf");
    const qnapPath = String(q.qnap_backup_path ?? "");
    push({
      eventType: "qnap_saved",
      title: "QNAP保存",
      description: qnapPath ? `${fileName} → ${qnapPath}` : fileName,
      createdAt: String(q.qnap_backup_completed_at),
    });
  }

  const shares = database
    .prepare(
      `SELECT document_kind, file_name, shared_at FROM pdf_share_logs WHERE project_id = ? ORDER BY shared_at ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const s of shares) {
    const label = SHARE_KIND_LABELS[String(s.document_kind)] ?? String(s.document_kind);
    push({
      eventType: "pdf_shared",
      title: "LINE共有",
      description: `${label} · ${String(s.file_name)}`,
      createdAt: String(s.shared_at),
    });
  }

  const legacy = database
    .prepare(
      `SELECT event_type, title, detail, created_at FROM business_project_timeline
       WHERE project_id = ? ORDER BY created_at ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const l of legacy) {
    const eventType = String(l.event_type);
    const mapped = LEGACY_EVENT_MAP[eventType];
    push({
      eventType: mapped?.eventType ?? eventType,
      title: mapped?.title ?? String(l.title || eventType),
      description: String(l.detail ?? ""),
      createdAt: String(l.created_at),
    });
  }

  for (const d of collectStorageFileEvents(String(project.project_no))) {
    push(d);
  }

  return new Set(drafts.map(dedupeKey));
}

export function applyRetroactiveBackfillFlags(
  database: Database.Database
): { projects: number; events: number } {
  const rows = database
    .prepare(`SELECT DISTINCT project_id FROM project_timeline_events`)
    .all() as Array<{ project_id: string }>;

  let projects = 0;
  let events = 0;
  const upd = database.prepare(`UPDATE project_timeline_events SET is_backfill = 1 WHERE id = ?`);

  for (const { project_id } of rows) {
    const hasMarked = database
      .prepare(
        `SELECT 1 FROM project_timeline_events WHERE project_id = ? AND is_backfill = 1 LIMIT 1`
      )
      .get(project_id);
    if (hasMarked) continue;

    const draftKeys = collectBackfillDraftKeys(database, project_id);
    if (draftKeys.size === 0) continue;

    const eventRows = database
      .prepare(
        `SELECT id, event_type, title, description, created_at FROM project_timeline_events
         WHERE project_id = ? AND is_backfill = 0`
      )
      .all(project_id) as Array<Record<string, unknown>>;

    let n = 0;
    for (const r of eventRows) {
      const key = dedupeKey({
        eventType: String(r.event_type),
        title: String(r.title),
        description: String(r.description ?? ""),
        createdAt: String(r.created_at),
      });
      if (draftKeys.has(key)) {
        upd.run(String(r.id));
        n += 1;
      }
    }
    if (n > 0) {
      projects += 1;
      events += n;
    }
  }

  return { projects, events };
}
