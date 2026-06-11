/** 到着・作業開始・作業完了 + 完了チェックリスト v1 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject, updateBusinessProject } from "../business/business-store.js";
import { normalizeProjectStatus } from "../business/business-status.js";
import { transitionProjectStatus } from "../business/business-workflow.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { SURVEY_WORK_TYPE_LABELS, type SurveyWorkType } from "../survey/survey-v1-types.js";
import type {
  CompletionChecklistItemV1,
  ProjectRefV1,
  WorkSessionV1,
} from "./field-ops-types.js";
import { listProjectWorkTemplateIds } from "./work-templates-store.js";
import { getWorkTemplateV1 } from "./work-templates-store.js";
import { reflectProjectCompletionToGoogleCalendar } from "../schedule/google-calendar-sync-service.js";

const CHECKLIST_BY_WORK_TYPE: Record<string, Array<{ category: string; label: string }>> = {
  camera: [
    { category: "防犯カメラ", label: "映像確認" },
    { category: "防犯カメラ", label: "録画確認" },
    { category: "防犯カメラ", label: "通知確認" },
    { category: "防犯カメラ", label: "お客様説明" },
  ],
  lan: [
    { category: "LAN", label: "通信確認" },
    { category: "LAN", label: "スピード確認" },
    { category: "LAN", label: "ラベル貼付" },
  ],
  wifi: [
    { category: "Wi-Fi", label: "接続確認" },
    { category: "Wi-Fi", label: "速度確認" },
    { category: "Wi-Fi", label: "お客様説明" },
  ],
};

function rowToSession(r: Record<string, unknown>): WorkSessionV1 {
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    workDate: String(r.work_date),
    scheduleEventId: r.schedule_event_id != null ? String(r.schedule_event_id) : null,
    arrivalTime: r.arrival_time != null ? String(r.arrival_time) : null,
    arrivalLat: r.arrival_lat != null ? Number(r.arrival_lat) : null,
    arrivalLng: r.arrival_lng != null ? Number(r.arrival_lng) : null,
    startTime: r.start_time != null ? String(r.start_time) : null,
    completionTime: r.completion_time != null ? String(r.completion_time) : null,
    workerName: r.worker_name != null ? String(r.worker_name) : null,
    workMemo: r.work_memo != null ? String(r.work_memo) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToChecklistItem(r: Record<string, unknown>): CompletionChecklistItemV1 {
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    category: String(r.category),
    label: String(r.label),
    checked: Number(r.checked ?? 0) === 1,
    checkedAt: r.checked_at != null ? String(r.checked_at) : null,
    checkedBy: r.checked_by != null ? String(r.checked_by) : null,
    sortOrder: Number(r.sort_order ?? 0),
    source: String(r.source) === "manual" ? "manual" : "auto",
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatTimeJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function getWorkSessionV1(ref: ProjectRefV1, workDate?: string): WorkSessionV1 | null {
  const date = workDate ?? todayIso();
  const row = getDatabase()
    .prepare(
      `SELECT * FROM project_work_sessions
       WHERE project_source = ? AND project_id = ? AND work_date = ?`
    )
    .get(ref.source, ref.projectId, date) as Record<string, unknown> | undefined;
  return row ? rowToSession(row) : null;
}

export function listWorkSessionsForDate(workDate: string): WorkSessionV1[] {
  const rows = getDatabase()
    .prepare(`SELECT * FROM project_work_sessions WHERE work_date = ? ORDER BY arrival_time ASC`)
    .all(workDate) as Array<Record<string, unknown>>;
  return rows.map(rowToSession);
}

function getOrCreateSession(ref: ProjectRefV1, workDate: string, scheduleEventId?: string | null): WorkSessionV1 {
  const existing = getWorkSessionV1(ref, workDate);
  if (existing) return existing;
  const db = getDatabase();
  const id = uuid();
  const now = nowIso();
  db.prepare(
    `INSERT INTO project_work_sessions (
      id, project_source, project_id, work_date, schedule_event_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, ref.source, ref.projectId, workDate, scheduleEventId ?? null, now, now);
  return getWorkSessionV1(ref, workDate)!;
}

function parseWorkTypesFromProject(ref: ProjectRefV1): SurveyWorkType[] {
  const db = getDatabase();
  if (ref.source === "survey") {
    const row = db
      .prepare(`SELECT work_types_json FROM survey_projects WHERE project_id = ?`)
      .get(ref.projectId) as { work_types_json?: string } | undefined;
    if (!row?.work_types_json) return [];
    try {
      const arr = JSON.parse(row.work_types_json) as unknown[];
      return arr.filter((v): v is SurveyWorkType => typeof v === "string");
    } catch {
      return [];
    }
  }
  const biz = db
    .prepare(`SELECT survey_project_id FROM business_projects WHERE id = ?`)
    .get(ref.projectId) as { survey_project_id?: string | null } | undefined;
  if (!biz?.survey_project_id) return [];
  const row = db
    .prepare(`SELECT work_types_json FROM survey_projects WHERE project_id = ?`)
    .get(biz.survey_project_id) as { work_types_json?: string } | undefined;
  if (!row?.work_types_json) return [];
  try {
    const arr = JSON.parse(row.work_types_json) as unknown[];
    return arr.filter((v): v is SurveyWorkType => typeof v === "string");
  } catch {
    return [];
  }
}

function collectChecklistDefaults(ref: ProjectRefV1): Array<{ category: string; label: string }> {
  const out: Array<{ category: string; label: string }> = [];
  const seen = new Set<string>();

  for (const wt of parseWorkTypesFromProject(ref)) {
    const items = CHECKLIST_BY_WORK_TYPE[wt];
    if (!items) continue;
    for (const it of items) {
      const key = `${it.category}::${it.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }

  for (const templateId of listProjectWorkTemplateIds(ref)) {
    const tpl = getWorkTemplateV1(templateId);
    if (!tpl) continue;
    if (/カメラ|防犯/i.test(tpl.name)) {
      for (const it of CHECKLIST_BY_WORK_TYPE.camera ?? []) {
        const key = `${it.category}::${it.label}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(it);
        }
      }
    }
    if (/LAN|配線/i.test(tpl.name)) {
      for (const it of CHECKLIST_BY_WORK_TYPE.lan ?? []) {
        const key = `${it.category}::${it.label}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(it);
        }
      }
    }
  }

  if (!out.length) {
    out.push(
      { category: "共通", label: "作業完了確認" },
      { category: "共通", label: "お客様説明" }
    );
  }
  return out;
}

export function listCompletionChecklistV1(ref: ProjectRefV1): CompletionChecklistItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM completion_checklist_items
       WHERE project_source = ? AND project_id = ?
       ORDER BY sort_order ASC, category ASC, label ASC`
    )
    .all(ref.source, ref.projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToChecklistItem);
}

export function generateCompletionChecklistV1(ref: ProjectRefV1): CompletionChecklistItemV1[] {
  const existing = listCompletionChecklistV1(ref);
  if (existing.length) return existing;

  const defaults = collectChecklistDefaults(ref);
  const db = getDatabase();
  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO completion_checklist_items (
      id, project_source, project_id, category, label, checked, sort_order, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 'auto', ?, ?)`
  );
  defaults.forEach((it, i) => {
    insert.run(uuid(), ref.source, ref.projectId, it.category, it.label, i, now, now);
  });
  return listCompletionChecklistV1(ref);
}

export function updateCompletionChecklistItemV1(
  itemId: string,
  patch: { checked?: boolean; checkedBy?: string | null; label?: string }
): CompletionChecklistItemV1 | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM completion_checklist_items WHERE id = ?`).get(itemId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const now = nowIso();
  if (patch.checked !== undefined) {
    db.prepare(
      `UPDATE completion_checklist_items SET checked = ?, checked_at = ?, checked_by = ?, updated_at = ? WHERE id = ?`
    ).run(patch.checked ? 1 : 0, patch.checked ? now : null, patch.checkedBy ?? null, now, itemId);
  }
  if (patch.label != null) {
    db.prepare(`UPDATE completion_checklist_items SET label = ?, updated_at = ? WHERE id = ?`).run(
      patch.label,
      now,
      itemId
    );
  }
  const updated = db.prepare(`SELECT * FROM completion_checklist_items WHERE id = ?`).get(itemId) as
    | Record<string, unknown>
    | undefined;
  return updated ? rowToChecklistItem(updated) : null;
}

function appendWorkTimeline(ref: ProjectRefV1, label: string, detail: string): void {
  if (ref.source !== "business") return;
  appendProjectTimeline({
    projectId: ref.projectId,
    eventType: "construction",
    title: label,
    detail,
  });
}

function maybeAdvanceOnArrival(ref: ProjectRefV1): void {
  if (ref.source !== "business") return;
  const project = getBusinessProject(ref.projectId);
  if (!project) return;
  const status = normalizeProjectStatus(project.status);
  if (["estimate_sent", "estimate_created"].includes(status)) {
    try {
      transitionProjectStatus(ref.projectId, "construction_scheduled");
    } catch {
      /* */
    }
  }
}

function ensureConstructionDoneStatus(projectId: string): void {
  let project = getBusinessProject(projectId);
  if (!project) return;
  let status = normalizeProjectStatus(project.status);
  if (["estimate_created", "estimate_sent"].includes(status)) {
    try {
      transitionProjectStatus(projectId, "construction_scheduled");
    } catch {
      /* */
    }
    project = getBusinessProject(projectId);
    if (!project) return;
    status = normalizeProjectStatus(project.status);
  }
  if (status === "construction_scheduled") {
    try {
      transitionProjectStatus(projectId, "construction_done");
    } catch {
      /* */
    }
  }
}

function maybeAdvanceOnComplete(ref: ProjectRefV1): void {
  if (ref.source === "business") {
    ensureConstructionDoneStatus(ref.projectId);
    return;
  }
  const db = getDatabase();
  const row = db
    .prepare(`SELECT workflow_status FROM survey_projects WHERE project_id = ?`)
    .get(ref.projectId) as { workflow_status?: string } | undefined;
  if (row?.workflow_status === "ordered") {
    db.prepare(
      `UPDATE survey_projects SET workflow_status = 'completed', updated_at = ? WHERE project_id = ?`
    ).run(nowIso(), ref.projectId);
  }
}

export function recordArrivalV1(
  ref: ProjectRefV1,
  input: {
    workDate?: string;
    lat?: number | null;
    lng?: number | null;
    workerName?: string | null;
    scheduleEventId?: string | null;
  }
): WorkSessionV1 {
  const workDate = input.workDate ?? todayIso();
  const session = getOrCreateSession(ref, workDate, input.scheduleEventId);
  if (session.arrivalTime) return session;

  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE project_work_sessions SET
        arrival_time = ?, arrival_lat = ?, arrival_lng = ?, worker_name = COALESCE(?, worker_name),
        schedule_event_id = COALESCE(?, schedule_event_id), updated_at = ?
       WHERE id = ?`
    )
    .run(
      now,
      input.lat ?? null,
      input.lng ?? null,
      input.workerName ?? null,
      input.scheduleEventId ?? null,
      now,
      session.id
    );

  generateCompletionChecklistV1(ref);
  maybeAdvanceOnArrival(ref);
  appendWorkTimeline(ref, "現場到着", formatTimeJa(now));
  return getWorkSessionV1(ref, workDate)!;
}

export function recordWorkStartV1(ref: ProjectRefV1, workDate?: string): WorkSessionV1 {
  const date = workDate ?? todayIso();
  const session = getOrCreateSession(ref, date);
  if (!session.arrivalTime) {
    throw new Error("到着記録が必要です");
  }
  if (session.startTime) return session;

  const now = nowIso();
  getDatabase()
    .prepare(`UPDATE project_work_sessions SET start_time = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, session.id);
  appendWorkTimeline(ref, "作業開始", formatTimeJa(now));
  return getWorkSessionV1(ref, date)!;
}

export function recordWorkCompleteV1(ref: ProjectRefV1, workDate?: string): WorkSessionV1 {
  const date = workDate ?? todayIso();
  const session = getOrCreateSession(ref, date);
  if (!session.startTime) {
    throw new Error("作業開始が必要です");
  }
  if (session.completionTime) return session;

  const now = nowIso();
  getDatabase()
    .prepare(`UPDATE project_work_sessions SET completion_time = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, session.id);
  maybeAdvanceOnComplete(ref);
  appendWorkTimeline(ref, "作業完了", formatTimeJa(now));
  reflectProjectCompletionToGoogleCalendar(ref, now).catch(() => {
    /* Google未連携時は無視 */
  });
  return getWorkSessionV1(ref, date)!;
}

export function countTodayConstructionInProgress(): number {
  const today = todayIso();
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM project_work_sessions
       WHERE work_date = ? AND arrival_time IS NOT NULL AND completion_time IS NULL`
    )
    .get(today) as { c: number };
  return row?.c ?? 0;
}

export function countTodayCompletions(): number {
  const today = todayIso();
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM project_work_sessions
       WHERE work_date = ? AND completion_time IS NOT NULL`
    )
    .get(today) as { c: number };
  return row?.c ?? 0;
}

export function countMonthCompletions(): number {
  const prefix = todayIso().slice(0, 7);
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM project_work_sessions
       WHERE work_date LIKE ? AND completion_time IS NOT NULL`
    )
    .get(`${prefix}%`) as { c: number };
  return row?.c ?? 0;
}

export function getLatestWorkSessionForProject(ref: ProjectRefV1): WorkSessionV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM project_work_sessions
       WHERE project_source = ? AND project_id = ?
       ORDER BY work_date DESC, updated_at DESC LIMIT 1`
    )
    .get(ref.source, ref.projectId) as Record<string, unknown> | undefined;
  return row ? rowToSession(row) : null;
}

export function buildWorkContentSummary(ref: ProjectRefV1): string {
  const types = parseWorkTypesFromProject(ref);
  const labels = types.map((t) => SURVEY_WORK_TYPE_LABELS[t] ?? t);
  const templates = listProjectWorkTemplateIds(ref)
    .map((id) => getWorkTemplateV1(id)?.name)
    .filter(Boolean) as string[];
  const parts = [...new Set([...labels, ...templates])];
  return parts.length ? parts.join(" / ") : "工事作業";
}

export function formatChecklistForPdf(ref: ProjectRefV1): string {
  const items = listCompletionChecklistV1(ref);
  if (!items.length) return "";
  const byCat = new Map<string, CompletionChecklistItemV1[]>();
  for (const it of items) {
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }
  const lines: string[] = [];
  for (const [cat, catItems] of byCat) {
    lines.push(`【${cat}】`);
    for (const it of catItems) {
      lines.push(`${it.checked ? "☑" : "□"} ${it.label}`);
    }
  }
  return lines.join("\n");
}
