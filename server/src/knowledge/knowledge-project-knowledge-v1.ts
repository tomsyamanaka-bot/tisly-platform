/** Knowledge Field UX V5 — 案件別関連ナレッジ一覧 */

import {
  aggregateKnowledgeUsageRankingV1,
  listKnowledgeUsageLogsV1,
} from "./knowledge-usage-log-v1.js";
import { unifiedKnowledgeSearchV1 } from "./unified-knowledge-search-v1.js";

export interface KnowledgeProjectKnowledgeItemV1 {
  id: string;
  kind: string;
  title: string;
  category: string;
  hasPdf: boolean;
  hasPhoto: boolean;
  usageCount: number;
  lastUsedAt?: string;
  detailUrl: string;
}

export function listProjectKnowledgeV1(projectId: string, limit = 30): KnowledgeProjectKnowledgeItemV1[] {
  const pid = projectId.trim();
  if (!pid) return [];

  const ranking = aggregateKnowledgeUsageRankingV1(500);
  const rankingMap = new Map(ranking.map((r) => [r.knowledgeId, r]));

  const search = unifiedKnowledgeSearchV1({ query: pid, limit: 50 });
  const hits = search.hits.filter((h) => h.projectNo === pid || h.id.includes(pid));

  const usageByKnowledge = new Map<string, { count: number; lastUsedAt: string }>();
  for (const e of listKnowledgeUsageLogsV1(500)) {
    if (e.projectId !== pid) continue;
    const existing = usageByKnowledge.get(e.knowledgeId);
    if (!existing) {
      usageByKnowledge.set(e.knowledgeId, { count: 1, lastUsedAt: e.usedAt });
    } else {
      existing.count += 1;
      if (e.usedAt > existing.lastUsedAt) existing.lastUsedAt = e.usedAt;
    }
  }

  const items: KnowledgeProjectKnowledgeItemV1[] = hits.map((h) => {
    const rank = rankingMap.get(h.id);
    const projectUsage = usageByKnowledge.get(h.id);
    return {
      id: h.id,
      kind: h.kind,
      title: h.title,
      category: h.category || "—",
      hasPdf: Boolean(h.hasPdf ?? h.openUrl?.includes(".pdf")),
      hasPhoto: Boolean(h.hasPhoto),
      usageCount: projectUsage?.count ?? rank?.count ?? 0,
      lastUsedAt: projectUsage?.lastUsedAt ?? rank?.lastUsedAt,
      detailUrl: `/knowledge-detail-v1?id=${encodeURIComponent(h.id)}&kind=${encodeURIComponent(h.kind)}`,
    };
  });

  return items
    .sort(
      (a, b) =>
        b.usageCount - a.usageCount ||
        (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "") ||
        a.title.localeCompare(b.title, "ja")
    )
    .slice(0, Math.max(1, limit));
}
