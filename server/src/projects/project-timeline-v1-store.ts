/** 案件タイムライン v1 — project_timeline_events */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
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
  | "completion"
  | "share"
  | "qnap"
  | "general";

export interface ProjectTimelineEventV1 {
  id: string;
  projectId: string;
  eventType: ProjectTimelineEventTypeV1 | string;
  title: string;
  description: string;
  createdAt: string;
  category: ProjectTimelineCategoryV1;
}

const EVENT_CATEGORY: Record<string, ProjectTimelineCategoryV1> = {
  estimate_created: "estimate",
  estimate_pdf_saved: "estimate",
  invoice_created: "invoice",
  invoice_pdf_saved: "invoice",
  specification_created: "general",
  specification_saved: "general",
  completion_created: "completion",
  completion_saved: "completion",
  pdf_shared: "share",
  qnap_saved: "qnap",
};

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
  };
}

export function addProjectTimelineEventV1(input: {
  projectId: string;
  eventType: ProjectTimelineEventTypeV1 | string;
  title: string;
  description?: string;
  createdAt?: string;
}): ProjectTimelineEventV1 {
  const id = `PTE-${uuid().slice(0, 8).toUpperCase()}`;
  const now = input.createdAt ?? new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO project_timeline_events (id, project_id, event_type, title, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.projectId, input.eventType, input.title, input.description ?? "", now);
  return {
    id,
    projectId: input.projectId,
    eventType: input.eventType,
    title: input.title,
    description: input.description ?? "",
    createdAt: now,
    category: categoryFor(input.eventType),
  };
}

export function listProjectTimelineEventsV1(
  projectId: string,
  opts?: { q?: string; limit?: number }
): ProjectTimelineEventV1[] {
  const limit = opts?.limit ?? 300;
  const rows = getDatabase()
    .prepare(
      `SELECT id, project_id, event_type, title, description, created_at
       FROM project_timeline_events
       WHERE project_id = ?
       ORDER BY created_at DESC
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
  const kindLabels: Record<string, string> = {
    estimate: "見積書",
    invoice: "請求書",
    specification: "仕様書",
    completion: "完了報告書",
    "completion-report": "完了報告書",
    report: "完了報告書",
  };
  const label = kindLabels[documentKind] ?? documentKind;
  addProjectTimelineEventV1({
    projectId,
    eventType: "pdf_shared",
    title: "LINE共有",
    description: `${label} · ${fileName}`,
  });
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
