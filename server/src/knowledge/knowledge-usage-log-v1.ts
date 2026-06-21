/** Knowledge Field UX V3 — 使ったログ（localStorage 同期用 API） */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ensureKnowledgeFolderStructure, getKnowledgeDataRoot } from "./knowledge-paths-v1.js";

export interface KnowledgeUsageLogEntryV1 {
  id: string;
  knowledgeId: string;
  title: string;
  query?: string;
  projectId?: string;
  usedAt: string;
  userId?: string;
  category?: string;
  source?: string;
  kind?: string;
}

export interface KnowledgeUsageRankingItemV1 {
  knowledgeId: string;
  title: string;
  count: number;
  lastUsedAt: string;
  category: string;
  kind?: string;
}

function usageLogPath(): string {
  ensureKnowledgeFolderStructure();
  return path.join(getKnowledgeDataRoot(), "usage-log.json");
}

function readLogFile(): KnowledgeUsageLogEntryV1[] {
  try {
    const raw = fs.readFileSync(usageLogPath(), "utf8");
    const parsed = JSON.parse(raw) as { entries?: KnowledgeUsageLogEntryV1[] };
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

function writeLogFile(entries: KnowledgeUsageLogEntryV1[]): void {
  fs.writeFileSync(
    usageLogPath(),
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8"
  );
}

export function appendKnowledgeUsageLogV1(input: {
  knowledgeId: string;
  title: string;
  query?: string;
  projectId?: string;
  userId?: string;
  category?: string;
  source?: string;
  kind?: string;
}): KnowledgeUsageLogEntryV1 {
  const entry: KnowledgeUsageLogEntryV1 = {
    id: randomUUID(),
    knowledgeId: String(input.knowledgeId ?? "").trim(),
    title: String(input.title ?? "").trim(),
    query: input.query?.trim() || undefined,
    projectId: input.projectId?.trim() || undefined,
    userId: input.userId?.trim() || undefined,
    category: input.category?.trim() || undefined,
    source: input.source?.trim() || "field",
    kind: input.kind?.trim() || undefined,
    usedAt: new Date().toISOString(),
  };

  if (!entry.knowledgeId) {
    throw new Error("knowledgeId is required");
  }

  const entries = readLogFile();
  entries.unshift(entry);
  writeLogFile(entries.slice(0, 5000));
  return entry;
}

export function listKnowledgeUsageLogsV1(limit = 100): KnowledgeUsageLogEntryV1[] {
  return readLogFile().slice(0, Math.max(1, limit));
}

export function aggregateKnowledgeUsageRankingV1(limit = 10): KnowledgeUsageRankingItemV1[] {
  const entries = readLogFile();
  const map = new Map<string, KnowledgeUsageRankingItemV1>();

  for (const e of entries) {
    const key = e.knowledgeId;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        knowledgeId: e.knowledgeId,
        title: e.title,
        count: 1,
        lastUsedAt: e.usedAt,
        category: e.category ?? "—",
        kind: e.kind,
      });
      continue;
    }
    existing.count += 1;
    if (e.usedAt > existing.lastUsedAt) {
      existing.lastUsedAt = e.usedAt;
      existing.title = e.title || existing.title;
      existing.category = e.category || existing.category;
      existing.kind = e.kind || existing.kind;
    }
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}
