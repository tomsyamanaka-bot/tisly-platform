/** TiSLY Knowledge Core v1 — 型定義 */

export interface KnowledgeCardV1 {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  files: string[];
  updatedAt: string;
}

export interface KnowledgeSearchIndexEntryV1 {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  updatedAt: string;
}

export interface KnowledgeSearchIndexV1 {
  version: 1;
  updatedAt: string;
  entries: KnowledgeSearchIndexEntryV1[];
}

export interface KnowledgeSearchHitV1 {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  updatedAt: string;
  score: number;
  matchedFields: string[];
}

export interface WorkCategoriesMasterV1 {
  version: number;
  updatedAt: string;
  description?: string;
  categories: string[];
}

export type KnowledgeFolderName =
  | "Standards"
  | "Procedures"
  | "Troubles"
  | "Templates"
  | "Ladder"
  | "Materials"
  | "Tools"
  | "Notes"
  | "KnowledgeCards"
  | "SearchIndex";

export const KNOWLEDGE_FOLDERS: KnowledgeFolderName[] = [
  "Standards",
  "Procedures",
  "Troubles",
  "Templates",
  "Ladder",
  "Materials",
  "Tools",
  "Notes",
  "KnowledgeCards",
  "SearchIndex",
];

export interface KnowledgeCardInputV1 {
  id?: string;
  title: string;
  category: string;
  tags?: string[];
  summary: string;
  files?: string[];
  updatedAt?: string;
}
