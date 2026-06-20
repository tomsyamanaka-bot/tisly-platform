/** TiSLY Knowledge 検索 v1 — タイトル/タグ/概要のキーワード検索（AI 未実装） */

import type { KnowledgeSearchHitV1, KnowledgeSearchIndexEntryV1 } from "./knowledge-types.js";

function normalizeQuery(q: string): string {
  return String(q ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tokenize(q: string): string[] {
  const n = normalizeQuery(q);
  if (!n) return [];
  return n.split(" ").filter(Boolean);
}

function fieldMatches(fieldValue: string, tokens: string[]): boolean {
  const hay = fieldValue.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/**
 * 将来 AI 検索に差し替え可能なインターフェース。
 * v1: 部分一致スコアリング。
 */
export function searchKnowledgeIndexV1(
  entries: KnowledgeSearchIndexEntryV1[],
  query: string
): KnowledgeSearchHitV1[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const hits: KnowledgeSearchHitV1[] = [];

  for (const entry of entries) {
    const matchedFields: string[] = [];
    let score = 0;

    if (fieldMatches(entry.title, tokens)) {
      matchedFields.push("title");
      score += 10;
    }
    if (fieldMatches(entry.summary, tokens)) {
      matchedFields.push("summary");
      score += 5;
    }
    const tagHay = entry.tags.join(" ");
    if (fieldMatches(tagHay, tokens)) {
      matchedFields.push("tags");
      score += 7;
    }
    if (fieldMatches(entry.category, tokens)) {
      matchedFields.push("category");
      score += 3;
    }

    if (matchedFields.length > 0) {
      hits.push({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        tags: entry.tags,
        summary: entry.summary,
        updatedAt: entry.updatedAt,
        score,
        matchedFields,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja"));
}

/** 将来: semanticSearchKnowledgeV1() をここに追加 */
