/**
 * 通話要約の確定登録
 * （Googleカレンダー・材料チェック・案件メモ）
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { ProjectRefV1 } from "../field-ops/field-ops-types.js";
import {
  addManualFieldCheckItemV1,
  createFieldCheckProjectV1,
  listFieldCheckProjectsV1,
} from "../field-ops/field-check-v1-store.js";
import { createGoogleCalendarEventForSync } from "../services/googleOAuthService.js";
import { getGoogleCalendarSettingsV1 } from "../schedule/google-calendar-sync-store.js";
import { getDatabase } from "../db/database.js";
import type { VoiceCallExtractionV1 } from "./voice-call-extract-v1.js";

export interface VoiceCallCommitInputV1 {
  extraction: VoiceCallExtractionV1;
  projectSource?: "survey" | "business" | "field_check";
  projectId?: string;
  tenantId?: string;
  countryCode?: "JP" | "AU";
  currency?: "JPY" | "AUD";
  transcript?: string;
}

export interface VoiceCallCommitResultV1 {
  ok: boolean;
  commitId: string;
  calendar: {
    mode: "mock" | "real";
    eventId: string | null;
    htmlLink?: string;
  };
  materials: { added: number; projectId: string; projectSource: string };
  memo: { saved: boolean; target: string };
  locale: "JP" | "AU";
  currency: "JPY" | "AUD";
}

function dataDir(): string {
  const dir = path.resolve(
    process.env.VOICE_CALL_DATA_DIR ||
      path.join(process.cwd(), "data", "voice-call")
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendCommitLog(entry: Record<string, unknown>): void {
  const file = path.join(dataDir(), "commits.json");
  let list: unknown[] = [];
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  list.push(entry);
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`, "utf8");
}

function toRfc3339(localIso: string): string {
  const raw = String(localIso || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00+09:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) {
    return raw.includes("+") || raw.endsWith("Z") ? raw : `${raw}+09:00`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const now = new Date();
  now.setHours(now.getHours() + 1, 0, 0, 0);
  return now.toISOString();
}

function resolveMaterialProject(
  input: VoiceCallCommitInputV1,
  scheduleTitle: string
): ProjectRefV1 {
  if (
    input.projectId &&
    (input.projectSource === "survey" || input.projectSource === "business")
  ) {
    return {
      source: input.projectSource,
      projectId: input.projectId,
    };
  }
  if (input.projectId && input.projectSource === "field_check") {
    return { source: "business", projectId: input.projectId };
  }
  const existing = listFieldCheckProjectsV1();
  if (existing.length > 0) {
    const hit = input.projectId
      ? existing.find((p) => p.id === input.projectId)
      : existing[0];
    if (hit) {
      return { source: hit.source, projectId: hit.id };
    }
  }
  const created = createFieldCheckProjectV1({
    title: scheduleTitle || "通話後フォロー案件",
    customerName: "音声クイック登録",
  });
  return { source: created.source, projectId: created.id };
}

function appendSurveyNotes(projectId: string, noteBlock: string): boolean {
  try {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT notes FROM survey_projects WHERE id = ?`)
      .get(projectId) as { notes?: string } | undefined;
    if (!row) return false;
    const prev = String(row.notes ?? "").trim();
    const next = prev ? `${prev}\n\n${noteBlock}` : noteBlock;
    db.prepare(
      `UPDATE survey_projects SET notes = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(next, projectId);
    return true;
  } catch {
    return false;
  }
}

function buildMemoBlock(extraction: VoiceCallExtractionV1): string {
  const lines = [
    "【通話クイック要約】",
    ...extraction.memo.summary3Lines.filter(Boolean).map((l) => `・${l}`),
  ];
  if (extraction.memo.customerRequests.length) {
    lines.push("【顧客要望】");
    for (const r of extraction.memo.customerRequests) {
      lines.push(`・${r}`);
    }
  }
  if (extraction.memo.decisions.length) {
    lines.push("【重要決定】");
    for (const d of extraction.memo.decisions) {
      lines.push(`・${d}`);
    }
  }
  return lines.join("\n");
}

export async function commitVoiceCallSummaryV1(
  input: VoiceCallCommitInputV1
): Promise<VoiceCallCommitResultV1> {
  const extraction = input.extraction;
  const commitId = `VC-${uuid().slice(0, 8).toUpperCase()}`;
  const locale = input.countryCode === "AU" ? "AU" : extraction.locale;
  const currency = input.currency === "AUD" ? "AUD" : extraction.currency;

  let calendarResult: VoiceCallCommitResultV1["calendar"] = {
    mode: "mock",
    eventId: null,
  };

  if (extraction.schedule?.title && extraction.schedule.startAt) {
    const settings = getGoogleCalendarSettingsV1();
    const calendarId = settings.calendarId || "primary";
    const start = toRfc3339(extraction.schedule.startAt);
    const end = toRfc3339(extraction.schedule.endAt || extraction.schedule.startAt);
    const created = await createGoogleCalendarEventForSync({
      calendarId,
      title: extraction.schedule.title,
      start,
      end,
      location: extraction.schedule.location || undefined,
      description: buildMemoBlock(extraction),
    });
    calendarResult = {
      mode: created.mode,
      eventId: created.eventId,
      htmlLink: created.htmlLink,
    };
  }

  const matRef = resolveMaterialProject(
    input,
    extraction.schedule?.title || "通話後フォロー"
  );
  let added = 0;
  for (const mat of extraction.materials) {
    addManualFieldCheckItemV1(matRef, {
      label: mat.orderTask ? `【発注】${mat.label}` : mat.label,
      quantity: mat.quantity,
      unit: mat.unit,
      category: "通話抽出",
    });
    added += 1;
  }

  const memoBlock = buildMemoBlock(extraction);
  let memoSaved = false;
  let memoTarget = "voice-call-log";
  if (matRef.source === "survey") {
    memoSaved = appendSurveyNotes(matRef.projectId, memoBlock);
    if (memoSaved) memoTarget = `survey:${matRef.projectId}`;
  }
  if (!memoSaved) {
    const memoFile = path.join(dataDir(), "memos.json");
    let memos: unknown[] = [];
    if (fs.existsSync(memoFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(memoFile, "utf8"));
        if (Array.isArray(parsed)) memos = parsed;
      } catch {
        memos = [];
      }
    }
    memos.push({
      id: commitId,
      projectId: matRef.projectId,
      projectSource: matRef.source,
      tenantId: input.tenantId ?? null,
      countryCode: locale,
      currency,
      memo: memoBlock,
      createdAt: new Date().toISOString(),
    });
    fs.writeFileSync(memoFile, `${JSON.stringify(memos, null, 2)}\n`, "utf8");
    memoSaved = true;
    memoTarget = "voice-call-memos";
  }

  appendCommitLog({
    commitId,
    tenantId: input.tenantId ?? null,
    countryCode: locale,
    currency,
    calendar: calendarResult,
    materialsAdded: added,
    project: matRef,
    memoTarget,
    createdAt: new Date().toISOString(),
  });

  return {
    ok: true,
    commitId,
    calendar: calendarResult,
    materials: {
      added,
      projectId: matRef.projectId,
      projectSource: matRef.source,
    },
    memo: { saved: memoSaved, target: memoTarget },
    locale,
    currency,
  };
}
