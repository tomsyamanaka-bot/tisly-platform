/** Knowledge Field UX V4 — 使用ログ集計（ダッシュボード / 将来 AI 分析用に分離） */

import {
  aggregateKnowledgeUsageRankingV1,
  listKnowledgeUsageLogsV1,
  type KnowledgeUsageLogEntryV1,
  type KnowledgeUsageRankingItemV1,
} from "./knowledge-usage-log-v1.js";

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
}): KnowledgeUsageDashboardV1 {
  const topLimit = options?.topLimit ?? 10;
  const categoryLimit = options?.categoryLimit ?? 12;
  const projectLimit = options?.projectLimit ?? 12;
  const recentLimit = options?.recentLimit ?? 30;

  return {
    topKnowledge: aggregateKnowledgeUsageRankingV1(topLimit),
    byCategory: aggregateUsageByCategoryV1(categoryLimit),
    byProject: aggregateUsageByProjectV1(projectLimit),
    recentLogs: listKnowledgeUsageLogsV1(recentLimit),
  };
}
