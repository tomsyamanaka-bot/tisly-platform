/** Knowledge Field UX V4 — 案件クイックアクセス（現場から資料へ） */

import fs from "fs";
import path from "path";
import { listKnowledgeUsageLogsV1 } from "./knowledge-usage-log-v1.js";
import { getKnowledgeDataRoot } from "./knowledge-paths-v1.js";
import { unifiedKnowledgeSearchV1 } from "./unified-knowledge-search-v1.js";

export interface KnowledgeProjectAccessItemV1 {
  projectId: string;
  propertyName: string;
  knowledgeCount: number;
  lastUsedAt: string;
  source: "usage_log" | "mock" | "search";
}

const MOCK_PROJECTS: KnowledgeProjectAccessItemV1[] = [
  {
    projectId: "MO-26-0616-001",
    propertyName: "守谷市テスト現場",
    knowledgeCount: 4,
    lastUsedAt: "2026-06-20T10:00:00.000Z",
    source: "mock",
  },
  {
    projectId: "MO-26-0617-001",
    propertyName: "ドキュメント閲覧テスト現場",
    knowledgeCount: 3,
    lastUsedAt: "2026-06-19T14:30:00.000Z",
    source: "mock",
  },
  {
    projectId: "MO-26-0618-004",
    propertyName: "6枚仕様書現場",
    knowledgeCount: 2,
    lastUsedAt: "2026-06-18T09:15:00.000Z",
    source: "mock",
  },
];

function countKnowledgeCardsForProject(projectId: string): number {
  const root = getKnowledgeDataRoot();
  const cardsDir = path.join(root, "KnowledgeCards");
  if (!fs.existsSync(cardsDir)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(cardsDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(cardsDir, file), "utf8");
      if (raw.includes(projectId)) count += 1;
    } catch {
      /* skip */
    }
  }
  return count;
}

function propertyNameFromProjectId(projectId: string): string {
  const mock = MOCK_PROJECTS.find((p) => p.projectId === projectId);
  if (mock) return mock.propertyName;
  const hits = unifiedKnowledgeSearchV1({ query: projectId, limit: 5 });
  const hit = hits.hits.find((h) => h.projectNo === projectId || h.id.includes(projectId));
  return hit?.title?.split("_").pop() ?? projectId;
}

export function listKnowledgeProjectAccessV1(limit = 10): KnowledgeProjectAccessItemV1[] {
  const map = new Map<string, KnowledgeProjectAccessItemV1>();

  for (const entry of listKnowledgeUsageLogsV1(500)) {
    const projectId = entry.projectId?.trim();
    if (!projectId) continue;
    const existing = map.get(projectId);
    if (!existing) {
      map.set(projectId, {
        projectId,
        propertyName: propertyNameFromProjectId(projectId),
        knowledgeCount: countKnowledgeCardsForProject(projectId) || 1,
        lastUsedAt: entry.usedAt,
        source: "usage_log",
      });
      continue;
    }
    existing.knowledgeCount = Math.max(existing.knowledgeCount, countKnowledgeCardsForProject(projectId));
    if (entry.usedAt > existing.lastUsedAt) existing.lastUsedAt = entry.usedAt;
  }

  for (const mock of MOCK_PROJECTS) {
    if (!map.has(mock.projectId)) {
      map.set(mock.projectId, { ...mock });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, Math.max(1, limit));
}

export function listProjectUsageLogsV1(projectId: string, limit = 50) {
  const pid = projectId.trim();
  if (!pid) return [];
  return listKnowledgeUsageLogsV1(500).filter((e) => e.projectId === pid).slice(0, limit);
}

export function filterKnowledgeHitsByProjectV1<T extends { projectNo?: string; id?: string }>(
  hits: T[],
  projectId: string
): T[] {
  const pid = projectId.trim();
  if (!pid) return hits;
  return hits.filter((h) => h.projectNo === pid || (h.id && h.id.includes(pid)));
}
