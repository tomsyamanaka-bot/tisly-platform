/** TiSLY Knowledge — 写真ナレッジ v1 */

import { getDatabase } from "../db/database.js";
import { listKnowledgeCardsV1, saveKnowledgeCardV1 } from "./knowledge-store-v1.js";
import type { KnowledgeCardV1, KnowledgePhotoKindV1 } from "./knowledge-types.js";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface KnowledgePhotoCardInputV1 {
  projectId: string;
  projectNo: string;
  customerName: string;
  category: string;
  photoKind: KnowledgePhotoKindV1;
  photoId: string;
  title: string;
  tags?: string[];
  url?: string;
  cardId: string;
}

export function buildKnowledgePhotoCardV1(input: KnowledgePhotoCardInputV1): KnowledgeCardV1 {
  const folder = input.photoKind === "survey" ? "Photos/survey" : "Photos/completion";
  const summary =
    input.photoKind === "survey"
      ? `現調写真: ${input.title}（案件 ${input.projectNo}）`
      : `完了報告写真: ${input.title}（案件 ${input.projectNo}）`;

  return saveKnowledgeCardV1({
    id: input.cardId,
    title: input.title,
    category: input.category,
    tags: [...new Set([...(input.tags ?? []), input.category, input.photoKind === "survey" ? "現調" : "完了報告"])],
    summary,
    files: [`${folder}/${input.photoId}.jpg`],
    updatedAt: todayIsoDate(),
    sourceType: "photo",
    relatedProjectIds: [input.projectId],
    projectNo: input.projectNo,
    customerName: input.customerName,
    photoMeta: {
      photoId: input.photoId,
      photoKind: input.photoKind,
      title: input.title,
      tags: input.tags ?? [],
      url: input.url,
    },
  });
}

export function updatePhotoKnowledgeMetaV1(input: {
  photoKind: KnowledgePhotoKindV1;
  photoId: string;
  projectId: string;
  projectNo: string;
  customerName: string;
  title: string;
  category: string;
  tags?: string[];
  url?: string;
}): KnowledgeCardV1 {
  const cardId =
    input.photoKind === "survey"
      ? `PHOTO-SURVEY-${input.photoId.replace(/[^A-Z0-9]/gi, "").slice(0, 20).toUpperCase()}`
      : `PHOTO-COMP-${input.photoId.replace(/[^A-Z0-9]/gi, "").slice(0, 20).toUpperCase()}`;

  persistPhotoKnowledgeColumns(input);

  return buildKnowledgePhotoCardV1({
    ...input,
    cardId,
    tags: input.tags,
  });
}

function persistPhotoKnowledgeColumns(input: {
  photoKind: KnowledgePhotoKindV1;
  photoId: string;
  title: string;
  category: string;
  tags?: string[];
}): void {
  const db = getDatabase();
  const tagsJson = JSON.stringify(input.tags ?? []);
  if (input.photoKind === "survey") {
    db.prepare(
      `UPDATE survey_photos SET knowledge_title = ?, knowledge_category = ?, knowledge_tags_json = ? WHERE id = ?`
    ).run(input.title, input.category, tagsJson, input.photoId);
  } else {
    db.prepare(
      `UPDATE completion_photos SET knowledge_title = ?, knowledge_category = ?, knowledge_tags_json = ? WHERE id = ?`
    ).run(input.title, input.category, tagsJson, input.photoId);
  }
}

export function searchPhotoKnowledgeV1(query: string): KnowledgeCardV1[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listKnowledgeCardsV1().filter((c) => {
    if (c.sourceType !== "photo") return false;
    const hay = [c.title, c.category, ...(c.tags ?? []), c.summary, c.projectNo ?? ""]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
