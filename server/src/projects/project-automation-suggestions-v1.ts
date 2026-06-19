/** 案件自動化エンジン v1.5 — AI提案（ルールベース）+ 完了報告写真データ */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type {
  AiSuggestionV1,
  ProjectPhotoSlotV1,
  ProjectTaskV1,
  ProjectToolV1,
} from "./project-automation-types.js";

function rowToSuggestion(r: Record<string, unknown>): AiSuggestionV1 {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    suggestionType: String(r.suggestion_type),
    label: String(r.label),
    detail: r.detail != null ? String(r.detail) : null,
    status: String(r.status) === "dismissed" ? "dismissed" : "pending",
    createdAt: String(r.created_at),
  };
}

type RuleInput = {
  tasks?: ProjectTaskV1[];
  tools?: ProjectToolV1[];
  photos?: ProjectPhotoSlotV1[];
};

type RuleCandidate = {
  suggestionType: string;
  label: string;
  detail: string | null;
};

function buildRuleCandidates(
  projectId: string,
  input: RuleInput
): RuleCandidate[] {
  const tasks = input.tasks ?? [];
  const tools = input.tools ?? [];
  const photos = input.photos ?? [];
  const out: RuleCandidate[] = [];

  const unshot = photos.filter((p) => !p.shot);
  if (unshot.length > 0) {
    out.push({
      suggestionType: "photos_unshot",
      label: "施工写真が未撮影です",
      detail: `未撮影 ${unshot.length}件: ${unshot.map((p) => p.label).join("、")}`,
    });
  }

  const uncheckedTools = tools.filter((t) => !t.checked);
  const lanMissing = uncheckedTools.find((t) => /LANケーブル/i.test(t.label));
  if (lanMissing) {
    out.push({
      suggestionType: "tool_missing",
      label: "持ち物にLANケーブルがありません",
      detail: `${lanMissing.label} が未確認です`,
    });
  } else if (uncheckedTools.length > 0 && uncheckedTools.length <= 3) {
    out.push({
      suggestionType: "tools_unchecked",
      label: "持ち物の確認が残っています",
      detail: uncheckedTools.map((t) => t.label).join("、"),
    });
  }

  const nvrTask = tasks.find((t) => /NVR設定/i.test(t.label) && !t.done);
  if (nvrTask) {
    out.push({
      suggestionType: "task_incomplete",
      label: "NVR設定のやる事が未完了です",
      detail: nvrTask.label,
    });
  }

  const incompleteTasks = tasks.filter((t) => !t.done);
  if (incompleteTasks.length > 0 && photos.length > 0 && unshot.length > 0) {
    out.push({
      suggestionType: "completion_photos_missing",
      label: "完了報告に必要な写真が不足しています",
      detail: `やる事 ${incompleteTasks.length}件未完了 · 写真 ${unshot.length}件未撮影`,
    });
  }

  if (!out.length && projectId) {
    /* no-op placeholder for future AI */
  }

  return out;
}

export function refreshAiSuggestionsV1(projectId: string, input: RuleInput = {}): AiSuggestionV1[] {
  const db = getDatabase();
  const candidates = buildRuleCandidates(projectId, input);
  const now = new Date().toISOString();

  const dismissed = new Set(
    (
      db
        .prepare(
          `SELECT suggestion_type FROM ai_suggestions_v1 WHERE project_id = ? AND status = 'dismissed'`
        )
        .all(projectId) as Array<{ suggestion_type: string }>
    ).map((r) => r.suggestion_type)
  );

  db.prepare(`DELETE FROM ai_suggestions_v1 WHERE project_id = ? AND status = 'pending'`).run(
    projectId
  );

  const insert = db.prepare(
    `INSERT INTO ai_suggestions_v1 (id, project_id, suggestion_type, label, detail, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  );

  for (const c of candidates) {
    if (dismissed.has(c.suggestionType)) continue;
    insert.run(uuid(), projectId, c.suggestionType, c.label, c.detail, now);
  }

  return listAiSuggestionsV1(projectId);
}

export function listAiSuggestionsV1(projectId: string, pendingOnly = true): AiSuggestionV1[] {
  const where = pendingOnly ? `AND status = 'pending'` : "";
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM ai_suggestions_v1 WHERE project_id = ? ${where} ORDER BY created_at DESC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToSuggestion);
}

export function dismissAiSuggestionV1(projectId: string, suggestionId: string): boolean {
  const r = getDatabase()
    .prepare(
      `UPDATE ai_suggestions_v1 SET status = 'dismissed' WHERE id = ? AND project_id = ?`
    )
    .run(suggestionId, projectId);
  return r.changes > 0;
}

export { getCompletionReportPhotosV1 } from "./completion-report-photos-v1.js";
export { getSpecificationPhotosV1 } from "./specification-photos-v1.js";
