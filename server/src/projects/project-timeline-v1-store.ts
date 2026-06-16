/** 案件タイムライン v1 — project_timeline_events */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { projectStorageProjectDir } from "../storage/project-storage-provider.js";
import type { ProjectPdfKind } from "./project-pdf-store.js";

export type ProjectTimelineEventTypeV1 =
  | "project_created"
  | "project_updated"
  | "survey_created"
  | "estimate_created"
  | "estimate_pdf_saved"
  | "invoice_created"
  | "invoice_pdf_saved"
  | "specification_created"
  | "specification_saved"
  | "completion_created"
  | "completion_saved"
  | "pdf_shared"
  | "qnap_saved"
  | "photo_added"
  | "drawing_added"
  | "status_changed"
  | "assignee_changed";

export type ProjectTimelineCategoryV1 =
  | "estimate"
  | "invoice"
  | "specification"
  | "completion"
  | "share"
  | "qnap"
  | "photo"
  | "drawing"
  | "general";

export interface ProjectTimelineEventV1 {
  id: string;
  projectId: string;
  eventType: ProjectTimelineEventTypeV1 | string;
  title: string;
  description: string;
  createdAt: string;
  category: ProjectTimelineCategoryV1;
  isBackfill: boolean;
}

const EVENT_CATEGORY: Record<string, ProjectTimelineCategoryV1> = {
  estimate_created: "estimate",
  estimate_pdf_saved: "estimate",
  invoice_created: "invoice",
  invoice_pdf_saved: "invoice",
  specification_created: "specification",
  specification_saved: "specification",
  completion_created: "completion",
  completion_saved: "completion",
  pdf_shared: "share",
  qnap_saved: "qnap",
  photo_added: "photo",
  drawing_added: "drawing",
};

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

interface BackfillDraft {
  eventType: string;
  title: string;
  description: string;
  createdAt: string;
}

const PDF_KIND_EVENT: Record<
  ProjectPdfKind,
  { create: ProjectTimelineEventTypeV1; save: ProjectTimelineEventTypeV1; createTitle: string; saveTitle: string }
> = {
  estimate: {
    create: "estimate_pdf_saved",
    save: "estimate_pdf_saved",
    createTitle: "見積書作成",
    saveTitle: "見積PDF保存",
  },
  invoice: {
    create: "invoice_pdf_saved",
    save: "invoice_pdf_saved",
    createTitle: "請求書作成",
    saveTitle: "請求PDF保存",
  },
  specification: {
    create: "specification_created",
    save: "specification_saved",
    createTitle: "仕様書作成",
    saveTitle: "仕様書保存",
  },
  report: {
    create: "completion_created",
    save: "completion_saved",
    createTitle: "完了報告書作成",
    saveTitle: "完了報告書保存",
  },
};

function categoryFor(eventType: string): ProjectTimelineCategoryV1 {
  return EVENT_CATEGORY[eventType] ?? "general";
}

function rowToEvent(r: Record<string, unknown>): ProjectTimelineEventV1 {
  const eventType = String(r.event_type);
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    eventType,
    title: String(r.title),
    description: String(r.description ?? ""),
    createdAt: String(r.created_at),
    category: categoryFor(eventType),
    isBackfill: Boolean(r.is_backfill),
  };
}

export function addProjectTimelineEventV1(input: {
  projectId: string;
  eventType: ProjectTimelineEventTypeV1 | string;
  title: string;
  description?: string;
  createdAt?: string;
  isBackfill?: boolean;
}): ProjectTimelineEventV1 {
  const id = `PTE-${uuid().slice(0, 8).toUpperCase()}`;
  const now = input.createdAt ?? new Date().toISOString();
  const isBackfill = input.isBackfill ? 1 : 0;
  getDatabase()
    .prepare(
      `INSERT INTO project_timeline_events (id, project_id, event_type, title, description, created_at, is_backfill)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.projectId, input.eventType, input.title, input.description ?? "", now, isBackfill);
  return {
    id,
    projectId: input.projectId,
    eventType: input.eventType,
    title: input.title,
    description: input.description ?? "",
    createdAt: now,
    category: categoryFor(input.eventType),
    isBackfill: Boolean(isBackfill),
  };
}

export function listProjectTimelineEventsV1(
  projectId: string,
  opts?: { q?: string; limit?: number }
): ProjectTimelineEventV1[] {
  const limit = opts?.limit ?? 300;
  const rows = getDatabase()
    .prepare(
      `SELECT id, project_id, event_type, title, description, created_at, is_backfill
       FROM project_timeline_events
       WHERE project_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(projectId, limit) as Array<Record<string, unknown>>;

  const q = opts?.q?.trim().toLowerCase();
  return rows
    .map(rowToEvent)
    .filter((e) => {
      if (!q) return true;
      const hay = `${e.title} ${e.description} ${e.eventType}`.toLowerCase();
      return hay.includes(q);
    });
}

export function recordProjectPdfTimelineV1(
  projectId: string,
  kind: ProjectPdfKind,
  fileName: string,
  _isFirstSave: boolean
): void {
  const spec = PDF_KIND_EVENT[kind];
  addProjectTimelineEventV1({
    projectId,
    eventType: spec.save,
    title: spec.saveTitle,
    description: fileName,
  });
}

export function recordQnapTimelineV1(projectId: string, fileName: string, displayPath?: string): void {
  addProjectTimelineEventV1({
    projectId,
    eventType: "qnap_saved",
    title: "QNAP保存",
    description: displayPath ? `${fileName} → ${displayPath}` : fileName,
  });
}

export function recordPdfShareTimelineV1(
  projectId: string,
  documentKind: string,
  fileName: string
): void {
  const label = SHARE_KIND_LABELS[documentKind] ?? documentKind;
  addProjectTimelineEventV1({
    projectId,
    eventType: "pdf_shared",
    title: "LINE共有",
    description: `${label} · ${fileName}`,
  });
}

function dedupeKey(d: BackfillDraft): string {
  return `${d.eventType}|${d.createdAt.slice(0, 19)}|${d.title}|${d.description}`;
}

function collectStorageFileEvents(projectNo: string): BackfillDraft[] {
  const drafts: BackfillDraft[] = [];
  const localRoot = projectStorageProjectDir(projectNo);
  const folders: Array<{ folder: string; eventType: "photo_added" | "drawing_added"; title: string }> =
    [
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
      drafts.push({
        eventType,
        title,
        description: name,
        createdAt: stat.mtime.toISOString(),
      });
    }
  }
  return drafts;
}

/** 既存ソースから補完候補ドラフトを収集（INSERT なし） */
export function collectBackfillDraftsForProjectV1(projectId: string): BackfillDraft[] {
  const db = getDatabase();
  const project = db
    .prepare(
      `SELECT project_no, title, created_at, survey_project_id FROM business_projects WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!project) return [];

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

  const estimates = db
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

  const invoices = db
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

  const pdfRows = db
    .prepare(
      `SELECT kind, file_name, created_at, updated_at FROM project_pdf_meta
       WHERE project_id = ? AND deleted_at IS NULL AND local_path != ''`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  for (const p of pdfRows) {
    const kind = String(p.kind) as ProjectPdfKind;
    const spec = PDF_KIND_EVENT[kind];
    if (!spec) continue;
    push({
      eventType: spec.save,
      title: spec.saveTitle,
      description: String(p.file_name ?? `${kind}.pdf`),
      createdAt: String(p.updated_at ?? p.created_at),
    });
  }

  const qnapRows = db
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

  const shares = db
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

  const legacy = db
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

  drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return drafts;
}

/** is_backfill 列追加前に補完された履歴へフラグを付与 */
export function markRetroactiveBackfillFlagsV1(projectId: string): number {
  const db = getDatabase();
  const hasMarked = db
    .prepare(
      `SELECT 1 FROM project_timeline_events WHERE project_id = ? AND is_backfill = 1 LIMIT 1`
    )
    .get(projectId);
  if (hasMarked) return 0;

  const draftKeys = new Set(collectBackfillDraftsForProjectV1(projectId).map(dedupeKey));
  if (draftKeys.size === 0) return 0;

  const rows = db
    .prepare(
      `SELECT id, event_type, title, description, created_at FROM project_timeline_events
       WHERE project_id = ? AND is_backfill = 0`
    )
    .all(projectId) as Array<Record<string, unknown>>;

  let updated = 0;
  const upd = db.prepare(`UPDATE project_timeline_events SET is_backfill = 1 WHERE id = ?`);
  for (const r of rows) {
    const key = dedupeKey({
      eventType: String(r.event_type),
      title: String(r.title),
      description: String(r.description ?? ""),
      createdAt: String(r.created_at),
    });
    if (draftKeys.has(key)) {
      upd.run(String(r.id));
      updated += 1;
    }
  }
  return updated;
}

/** 既存案件の履歴を見積・請求・PDF・共有・QNAP 等から自動補完 */
export function backfillProjectTimelineV1(projectId: string): number {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT COUNT(*) as c FROM project_timeline_events WHERE project_id = ?`)
    .get(projectId) as { c: number };
  if (existing.c > 0) return 0;

  const drafts = collectBackfillDraftsForProjectV1(projectId);
  if (drafts.length === 0) return 0;
  for (const d of drafts) {
    addProjectTimelineEventV1({
      projectId,
      eventType: d.eventType,
      title: d.title,
      description: d.description,
      createdAt: d.createdAt,
      isBackfill: true,
    });
  }
  return drafts.length;
}

/** 履歴が空の全案件を一括補完 */
export function backfillAllEmptyProjectTimelinesV1(): { projects: number; events: number } {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT p.id FROM business_projects p
       WHERE p.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM project_timeline_events e WHERE e.project_id = p.id)`
    )
    .all() as Array<{ id: string }>;
  let projects = 0;
  let events = 0;
  for (const r of rows) {
    const n = backfillProjectTimelineV1(r.id);
    if (n > 0) {
      projects += 1;
      events += n;
    }
  }
  return { projects, events };
}

export function formatTimelineDateTimeV1(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${da} ${h}:${mi}`;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function formatTimelineDateGroupV1(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  const wd = WEEKDAY_JA[d.getDay()];
  return `${y}年${mo}月${da}日（${wd}）`;
}
