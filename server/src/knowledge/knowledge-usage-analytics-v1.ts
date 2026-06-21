/** Knowledge Field UX V4 — 使用ログ集計（ダッシュボード / 将来 AI 分析用に分離） */

import {
  aggregateKnowledgeUsageRankingV1,
  listKnowledgeUsageLogsV1,
  type KnowledgeUsageLogEntryV1,
  type KnowledgeUsageRankingItemV1,
} from "./knowledge-usage-log-v1.js";
import { buildUnifiedKnowledgeSearchCorpusV1 } from "./unified-knowledge-search-v1.js";

export interface KnowledgeUsageCategoryStatV1 {
  category: string;
  count: number;
  lastUsedAt: string;
}

export interface KnowledgeUsageProjectStatV1 {
  projectId: string;
  count: number;
  lastUsedAt: string;
  knowledgeCount: number;
}

export interface KnowledgeUsageDashboardV1 {
  topKnowledge: KnowledgeUsageRankingItemV1[];
  byCategory: KnowledgeUsageCategoryStatV1[];
  byProject: KnowledgeUsageProjectStatV1[];
  recentLogs: KnowledgeUsageLogEntryV1[];
  totalLogCount: number;
  unusedKnowledge: KnowledgeUsageRankingItemV1[];
  filters: KnowledgeUsageDashboardFiltersV1;
}

export interface KnowledgeUsageDashboardFiltersV1 {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  projectId?: string;
}

function filterEntries(
  entries: KnowledgeUsageLogEntryV1[],
  filters: KnowledgeUsageDashboardFiltersV1
): KnowledgeUsageLogEntryV1[] {
  return entries.filter((e) => {
    if (filters.category && (e.category || "—") !== filters.category) return false;
    if (filters.projectId && e.projectId !== filters.projectId) return false;
    if (filters.dateFrom && e.usedAt.slice(0, 10) < filters.dateFrom) return false;
    if (filters.dateTo && e.usedAt.slice(0, 10) > filters.dateTo) return false;
    return true;
  });
}

function aggregateRankingFromEntries(
  entries: KnowledgeUsageLogEntryV1[],
  limit: number
): KnowledgeUsageRankingItemV1[] {
  const map = new Map<string, KnowledgeUsageRankingItemV1>();
  for (const e of entries) {
    const existing = map.get(e.knowledgeId);
    if (!existing) {
      map.set(e.knowledgeId, {
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
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}

function aggregateCategoryFromEntries(
  entries: KnowledgeUsageLogEntryV1[],
  limit: number
): KnowledgeUsageCategoryStatV1[] {
  const map = new Map<string, KnowledgeUsageCategoryStatV1>();
  for (const e of entries) {
    const category = e.category?.trim() || "—";
    const existing = map.get(category);
    if (!existing) {
      map.set(category, { category, count: 1, lastUsedAt: e.usedAt });
      continue;
    }
    existing.count += 1;
    if (e.usedAt > existing.lastUsedAt) existing.lastUsedAt = e.usedAt;
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}

function aggregateProjectFromEntries(
  entries: KnowledgeUsageLogEntryV1[],
  limit: number
): KnowledgeUsageProjectStatV1[] {
  const map = new Map<string, KnowledgeUsageProjectStatV1 & { knowledgeIds: Set<string> }>();
  for (const e of entries) {
    const projectId = e.projectId?.trim();
    if (!projectId) continue;
    const existing = map.get(projectId);
    if (!existing) {
      map.set(projectId, {
        projectId,
        count: 1,
        lastUsedAt: e.usedAt,
        knowledgeCount: 1,
        knowledgeIds: new Set([e.knowledgeId]),
      });
      continue;
    }
    existing.count += 1;
    existing.knowledgeIds.add(e.knowledgeId);
    existing.knowledgeCount = existing.knowledgeIds.size;
    if (e.usedAt > existing.lastUsedAt) existing.lastUsedAt = e.usedAt;
  }
  return [...map.values()]
    .map(({ knowledgeIds, ...rest }) => rest)
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}

function findUnusedKnowledge(
  usedRanking: KnowledgeUsageRankingItemV1[],
  limit: number
): KnowledgeUsageRankingItemV1[] {
  const usedIds = new Set(usedRanking.map((r) => r.knowledgeId));
  const corpus = buildUnifiedKnowledgeSearchCorpusV1();
  const unused: KnowledgeUsageRankingItemV1[] = [];
  for (const doc of corpus) {
    if (usedIds.has(doc.id)) continue;
    unused.push({
      knowledgeId: doc.id,
      title: doc.title,
      count: 0,
      lastUsedAt: doc.createdAt,
      category: doc.category || "—",
      kind: doc.kind,
    });
    if (unused.length >= limit) break;
  }
  return unused.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

function readAllEntries(): KnowledgeUsageLogEntryV1[] {
  return listKnowledgeUsageLogsV1(5000);
}

export function aggregateUsageByCategoryV1(limit = 20): KnowledgeUsageCategoryStatV1[] {
  const map = new Map<string, KnowledgeUsageCategoryStatV1>();
  for (const e of readAllEntries()) {
    const category = e.category?.trim() || "—";
    const existing = map.get(category);
    if (!existing) {
      map.set(category, { category, count: 1, lastUsedAt: e.usedAt });
      continue;
    }
    existing.count += 1;
    if (e.usedAt > existing.lastUsedAt) existing.lastUsedAt = e.usedAt;
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}

export function aggregateUsageByProjectV1(limit = 20): KnowledgeUsageProjectStatV1[] {
  const map = new Map<string, KnowledgeUsageProjectStatV1 & { knowledgeIds: Set<string> }>();
  for (const e of readAllEntries()) {
    const projectId = e.projectId?.trim();
    if (!projectId) continue;
    const existing = map.get(projectId);
    if (!existing) {
      map.set(projectId, {
        projectId,
        count: 1,
        lastUsedAt: e.usedAt,
        knowledgeCount: 1,
        knowledgeIds: new Set([e.knowledgeId]),
      });
      continue;
    }
    existing.count += 1;
    existing.knowledgeIds.add(e.knowledgeId);
    existing.knowledgeCount = existing.knowledgeIds.size;
    if (e.usedAt > existing.lastUsedAt) existing.lastUsedAt = e.usedAt;
  }
  return [...map.values()]
    .map(({ knowledgeIds, ...rest }) => rest)
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}

export function buildKnowledgeUsageDashboardV1(options?: {
  topLimit?: number;
  categoryLimit?: number;
  projectLimit?: number;
  recentLimit?: number;
  unusedLimit?: number;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  projectId?: string;
}): KnowledgeUsageDashboardV1 {
  const topLimit = options?.topLimit ?? 10;
  const categoryLimit = options?.categoryLimit ?? 12;
  const projectLimit = options?.projectLimit ?? 12;
  const recentLimit = options?.recentLimit ?? 30;
  const unusedLimit = options?.unusedLimit ?? 10;
  const filters: KnowledgeUsageDashboardFiltersV1 = {
    dateFrom: options?.dateFrom || undefined,
    dateTo: options?.dateTo || undefined,
    category: options?.category || undefined,
    projectId: options?.projectId || undefined,
  };

  const allEntries = readAllEntries();
  const filtered = filterEntries(allEntries, filters);
  const topKnowledge = aggregateRankingFromEntries(filtered, topLimit);

  return {
    topKnowledge,
    byCategory: aggregateCategoryFromEntries(filtered, categoryLimit),
    byProject: aggregateProjectFromEntries(filtered, projectLimit),
    recentLogs: filtered.slice(0, recentLimit),
    totalLogCount: allEntries.length,
    unusedKnowledge: findUnusedKnowledge(aggregateRankingFromEntries(allEntries, 500), unusedLimit),
    filters,
  };
}

export function exportKnowledgeUsageCsvV1(options?: KnowledgeUsageDashboardFiltersV1): string {
  const entries = filterEntries(readAllEntries(), options ?? {});
  const header = "usedAt,knowledgeId,title,category,projectId,query,source,kind";
  const rows = entries.map((e) =>
    [
      e.usedAt,
      e.knowledgeId,
      `"${(e.title || "").replace(/"/g, '""')}"`,
      e.category || "",
      e.projectId || "",
      `"${(e.query || "").replace(/"/g, '""')}"`,
      e.source || "",
      e.kind || "",
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export function listUsageFilterCategoriesV1(): string[] {
  const set = new Set<string>();
  for (const e of readAllEntries()) {
    set.add(e.category?.trim() || "—");
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}

export function listUsageFilterProjectsV1(): string[] {
  const set = new Set<string>();
  for (const e of readAllEntries()) {
    if (e.projectId?.trim()) set.add(e.projectId.trim());
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}
