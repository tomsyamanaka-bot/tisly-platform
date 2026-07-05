/** TiSLY Knowledge Search V1 — 統合キーワード検索（Embedding/RAG 未使用） */

import { listBusinessProjects } from "../business/business-store.js";
import { listKnowledgeAssetsV1 } from "./knowledge-assets-v1.js";
import { listKnowledgeCandidatesV1 } from "./knowledge-candidates-store-v1.js";
import { listKnowledgeCardsV1, loadWorkCategoriesMaster } from "./knowledge-store-v1.js";
import type { KnowledgeAssetRecordV1 } from "./knowledge-automation-types.js";
import type { KnowledgeCardV1 } from "./knowledge-types.js";

export type UnifiedKnowledgeKindV1 =
  | "knowledge_card"
  | "candidate"
  | "project"
  | "pdf"
  | "photo"
  | "asset"
  | "plc"
  | "esp"
  | "3dprint"
  | "factory";

export interface UnifiedKnowledgeSearchHitV1 {
  id: string;
  kind: UnifiedKnowledgeKindV1;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  projectNo?: string;
  projectId?: string;
  customerName?: string;
  propertyName?: string;
  createdAt: string;
  score: number;
  matchReasons: string[];
  ladderDescription?: string;
  usage?: string;
  cautions?: string;
  fileFormats?: string[];
  filePath?: string;
  openUrl?: string;
  status?: string;
  hasPhoto?: boolean;
  hasPdf?: boolean;
  hasPlc?: boolean;
  has3dPrint?: boolean;
  hasQnap?: boolean;
  hasProject?: boolean;
  qnapPath?: string;
  relatedCount?: number;
}

export interface UnifiedKnowledgeSearchOptionsV1 {
  query: string;
  category?: string;
  projectNo?: string;
  dateFrom?: string;
  dateTo?: string;
  kinds?: UnifiedKnowledgeKindV1[];
  limit?: number;
}

export interface UnifiedKnowledgeSearchResultV1 {
  query: string;
  engine: "keyword_unified_v1";
  searchMode?: "and" | "or_fallback";
  filters: {
    category?: string;
    projectNo?: string;
    dateFrom?: string;
    dateTo?: string;
    kinds?: UnifiedKnowledgeKindV1[];
  };
  total: number;
  hits: UnifiedKnowledgeSearchHitV1[];
  categories: string[];
  kindCounts: Partial<Record<UnifiedKnowledgeKindV1, number>>;
}

interface SearchDocV1 {
  id: string;
  kind: UnifiedKnowledgeKindV1;
  title: string;
  category: string;
  tags: string[];
  body: string;
  projectNo?: string;
  projectId?: string;
  customerName?: string;
  propertyName?: string;
  createdAt: string;
  ladderDescription?: string;
  usage?: string;
  cautions?: string;
  fileFormats?: string[];
  filePath?: string;
  openUrl?: string;
  status?: string;
}

const FIELD_LABELS: Record<string, string> = {
  title: "タイトル一致",
  tags: "タグ一致",
  category: "カテゴリ一致",
  body: "本文一致",
  projectNo: "案件ID一致",
  customerName: "顧客名一致",
  propertyName: "物件名一致",
};

const FIELD_SCORES: Record<string, number> = {
  title: 10,
  tags: 7,
  category: 3,
  body: 5,
  projectNo: 6,
  customerName: 4,
  propertyName: 4,
};

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

function scoreDoc(doc: SearchDocV1, tokens: string[]): { score: number; matchReasons: string[] } {
  const matchedFields: string[] = [];
  let score = 0;

  if (fieldMatches(doc.title, tokens)) {
    matchedFields.push("title");
    score += FIELD_SCORES.title;
  }
  const tagHay = doc.tags.join(" ");
  if (fieldMatches(tagHay, tokens)) {
    matchedFields.push("tags");
    score += FIELD_SCORES.tags;
  }
  if (fieldMatches(doc.category, tokens)) {
    matchedFields.push("category");
    score += FIELD_SCORES.category;
  }
  if (fieldMatches(doc.body, tokens)) {
    matchedFields.push("body");
    score += FIELD_SCORES.body;
  }
  if (doc.projectNo && fieldMatches(doc.projectNo, tokens)) {
    matchedFields.push("projectNo");
    score += FIELD_SCORES.projectNo;
  }
  if (doc.customerName && fieldMatches(doc.customerName, tokens)) {
    matchedFields.push("customerName");
    score += FIELD_SCORES.customerName;
  }
  if (doc.propertyName && fieldMatches(doc.propertyName, tokens)) {
    matchedFields.push("propertyName");
    score += FIELD_SCORES.propertyName;
  }

  return {
    score,
    matchReasons: matchedFields.map((f) => FIELD_LABELS[f] ?? f),
  };
}

function inDateRange(isoDate: string, from?: string, to?: string): boolean {
  const d = isoDate.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function matchesCategoryFilter(doc: SearchDocV1, category: string): boolean {
  const filter = category.trim().toLowerCase();
  if (!filter) return true;
  const docCat = doc.category.toLowerCase();
  return docCat === filter || docCat.includes(filter) || filter.includes(docCat);
}

function resolveHitQnapPath(doc: SearchDocV1): string | undefined {
  if (doc.filePath?.startsWith("AI/")) return doc.filePath;
  if (doc.kind === "plc" && doc.filePath) return `PLC/${doc.filePath.replace(/^[/\\]+/, "")}`;
  if (doc.kind === "3dprint" && doc.filePath) return `3DPrint/${doc.filePath.replace(/^[/\\]+/, "")}`;
  if (doc.kind === "factory" && doc.filePath) return `Factory/${doc.filePath.replace(/^[/\\]+/, "")}`;
  if (doc.kind === "candidate") return `AI/Candidates/${doc.id}.json`;
  if (doc.kind === "project" && doc.projectNo) return `Projects/${doc.projectNo}`;
  if (doc.filePath) return doc.filePath;
  if (doc.kind === "knowledge_card" || doc.kind === "pdf" || doc.kind === "photo" || doc.kind === "esp") {
    return `AI/KnowledgeCards/${doc.id}.json`;
  }
  return undefined;
}

function enrichHit(doc: SearchDocV1, score: number, matchReasons: string[]): UnifiedKnowledgeSearchHitV1 {
  const qnapPath = resolveHitQnapPath(doc);
  const hasPhoto = doc.kind === "photo" || doc.tags.some((t) => /写真|photo/i.test(t));
  const hasPdf =
    doc.kind === "pdf" ||
    Boolean(doc.openUrl?.includes("document-viewer")) ||
    doc.tags.some((t) => /pdf/i.test(t));
  const hasPlc = doc.kind === "plc";
  const has3dPrint =
    doc.kind === "3dprint" ||
    Boolean(doc.fileFormats?.some((f) => /stl|step|gcode/i.test(f)));
  const hasProject = doc.kind === "project" || Boolean(doc.projectNo);
  const hasQnap = Boolean(qnapPath);

  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    category: doc.category,
    tags: doc.tags,
    summary: doc.body.slice(0, 280),
    projectNo: doc.projectNo,
    projectId: doc.projectId,
    customerName: doc.customerName,
    propertyName: doc.propertyName,
    createdAt: doc.createdAt,
    score,
    matchReasons,
    ladderDescription: doc.ladderDescription,
    usage: doc.usage,
    cautions: doc.cautions,
    fileFormats: doc.fileFormats,
    filePath: doc.filePath,
    openUrl: doc.openUrl,
    status: doc.status,
    hasPhoto,
    hasPdf,
    hasPlc,
    has3dPrint,
    hasQnap,
    hasProject,
    qnapPath,
    relatedCount: doc.tags.length,
  };
}

const OR_FALLBACK_MIN_HITS = 3;

function runUnifiedSearchPass(
  options: UnifiedKnowledgeSearchOptionsV1,
  mode: "and" | "or_fallback"
): UnifiedKnowledgeSearchHitV1[] {
  const tokens = tokenize(options.query);
  const kinds = options.kinds?.length ? new Set(options.kinds) : null;
  const corpus = buildUnifiedKnowledgeSearchCorpusV1();
  const hits: UnifiedKnowledgeSearchHitV1[] = [];
  const categoryFilter = options.category?.trim();

  for (const doc of corpus) {
    if (options.projectNo && doc.projectNo !== options.projectNo) continue;
    if (!inDateRange(doc.createdAt, options.dateFrom, options.dateTo)) continue;
    if (kinds && !kinds.has(doc.kind)) continue;

    const categoryMatches = categoryFilter ? matchesCategoryFilter(doc, categoryFilter) : true;
    if (mode === "and" && categoryFilter && !categoryMatches) continue;
    if (tokens.length === 0) continue;

    const { score, matchReasons } = scoreDoc(doc, tokens);
    if (score <= 0 && !(mode === "or_fallback" && categoryMatches)) continue;

    let finalScore = score;
    const reasons = [...matchReasons];
    if (categoryFilter && categoryMatches) {
      finalScore += 4;
      if (!reasons.includes(FIELD_LABELS.category)) reasons.push(FIELD_LABELS.category);
    }
    if (mode === "or_fallback" && categoryMatches && score <= 0) {
      finalScore = 3;
      if (!reasons.length) reasons.push("カテゴリ一致");
    }
    if (finalScore <= 0) continue;

    hits.push(enrichHit(doc, finalScore, reasons));
  }

  return hits.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja")
  );
}

function cardKind(card: KnowledgeCardV1): UnifiedKnowledgeKindV1 {
  if (card.sourceType === "pdf") return "pdf";
  if (card.sourceType === "photo") return "photo";
  if (card.sourceType === "plc-template") return "plc";
  if (card.sourceType === "rp-template") return "esp";
  return "knowledge_card";
}

function cardOpenUrl(card: KnowledgeCardV1): string | undefined {
  if (card.sourceType === "pdf" && card.pdfMeta?.projectId) {
    const kindMap: Record<string, string> = {
      estimate: "estimate",
      invoice: "invoice",
      specification: "specification",
      report: "completion",
    };
    const kind = kindMap[card.pdfMeta.kind] ?? "estimate";
    return `/document-viewer-v1.html?projectId=${encodeURIComponent(card.pdfMeta.projectId)}&kind=${kind}`;
  }
  if (card.sourceType === "photo" && card.photoMeta?.url) {
    return card.photoMeta.url;
  }
  return `/knowledge-register-v1#card-${encodeURIComponent(card.id)}`;
}

function parsePlcMeta(summary: string): { usage?: string; cautions?: string } {
  const usageMatch = summary.match(/用途[:：]\s*([^\n]+)/);
  const cautionMatch = summary.match(/注意点[:：]\s*([^\n]+)/);
  return {
    usage: usageMatch?.[1]?.trim(),
    cautions: cautionMatch?.[1]?.trim(),
  };
}

function docFromCard(card: KnowledgeCardV1): SearchDocV1 {
  const kind = cardKind(card);
  const plcMeta = kind === "plc" ? parsePlcMeta(card.summary) : {};
  return {
    id: card.id,
    kind,
    title: card.title,
    category: card.category,
    tags: card.tags ?? [],
    body: [card.summary, ...(card.files ?? [])].join(" "),
    projectNo: card.projectNo,
    projectId: card.relatedProjectIds?.[0],
    customerName: card.customerName,
    createdAt: card.updatedAt,
    ladderDescription: kind === "plc" ? extractLadderDescription(card.summary) : undefined,
    usage: plcMeta.usage,
    cautions: plcMeta.cautions,
    filePath: card.files?.[0],
    openUrl: cardOpenUrl(card),
  };
}

function extractLadderDescription(summary: string): string | undefined {
  const m = summary.match(/ラダー[:：]\s*([^\n]+)/);
  return m?.[1]?.trim();
}

function docFromCandidate(c: ReturnType<typeof listKnowledgeCandidatesV1>[number]): SearchDocV1 {
  return {
    id: c.id,
    kind: "candidate",
    title: c.title,
    category: c.category,
    tags: c.tags ?? [],
    body: [c.summary, c.pdfExtract?.notes?.join(" ") ?? "", c.assetPath ?? ""].join(" "),
    projectNo: c.projectNo,
    projectId: c.projectId,
    customerName: c.customerName ?? c.pdfExtract?.customerName,
    propertyName: c.pdfExtract?.propertyName,
    createdAt: c.createdAt.slice(0, 10),
    status: c.status,
    filePath: c.assetPath,
    openUrl: `/knowledge-candidates-v1#${encodeURIComponent(c.id)}`,
  };
}

function docFromProject(p: ReturnType<typeof listBusinessProjects>[number]): SearchDocV1 {
  return {
    id: p.id,
    kind: "project",
    title: p.title,
    category: p.status,
    tags: [p.municipality, p.assignee].filter(Boolean),
    body: [p.customerName, p.address, p.surveyMemo, p.constructionMemo, p.requiredMaterials]
      .filter(Boolean)
      .join(" "),
    projectNo: p.projectNo,
    projectId: p.id,
    customerName: p.customerName,
    propertyName: p.address,
    createdAt: p.createdAt.slice(0, 10),
    openUrl: `/projects-v1?projectId=${encodeURIComponent(p.id)}`,
  };
}

function docFromAsset(asset: KnowledgeAssetRecordV1): SearchDocV1 {
  const kind: UnifiedKnowledgeKindV1 =
    asset.domain === "PLC" ? "plc" : asset.domain === "3DPrint" ? "3dprint" : "factory";
  return {
    id: asset.id,
    kind: kind === "plc" ? "plc" : kind,
    title: asset.title,
    category: asset.category,
    tags: [...(asset.tags ?? []), asset.subFolder, ...(asset.fileFormats ?? [])],
    body: [asset.summary, asset.ladderDescription ?? "", asset.fileName].join(" "),
    projectNo: asset.projectNo,
    projectId: asset.projectId,
    createdAt: asset.updatedAt,
    ladderDescription: asset.ladderDescription,
    fileFormats: asset.fileFormats,
    filePath: asset.relativePath,
    openUrl: `/mothership-explorer-v1?q=${encodeURIComponent(asset.title)}`,
  };
}

export function buildUnifiedKnowledgeSearchCorpusV1(): SearchDocV1[] {
  const docs: SearchDocV1[] = [];

  for (const card of listKnowledgeCardsV1()) {
    docs.push(docFromCard(card));
  }

  for (const c of listKnowledgeCandidatesV1()) {
    docs.push(docFromCandidate(c));
  }

  for (const p of listBusinessProjects()) {
    docs.push(docFromProject(p));
  }

  for (const asset of listKnowledgeAssetsV1()) {
    docs.push(docFromAsset(asset));
  }

  return docs;
}

export function unifiedKnowledgeSearchV1(
  options: UnifiedKnowledgeSearchOptionsV1
): UnifiedKnowledgeSearchResultV1 {
  const tokens = tokenize(options.query);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const kinds = options.kinds?.length ? new Set(options.kinds) : null;
  const corpus = buildUnifiedKnowledgeSearchCorpusV1();
  const kindCounts: Partial<Record<UnifiedKnowledgeKindV1, number>> = {};

  for (const doc of corpus) {
    if (options.category && !matchesCategoryFilter(doc, options.category)) continue;
    if (options.projectNo && doc.projectNo !== options.projectNo) continue;
    if (!inDateRange(doc.createdAt, options.dateFrom, options.dateTo)) continue;
    if (kinds && !kinds.has(doc.kind)) continue;
    kindCounts[doc.kind] = (kindCounts[doc.kind] ?? 0) + 1;
  }

  let searchMode: "and" | "or_fallback" = "and";
  let hits = runUnifiedSearchPass(options, "and");

  if (options.category?.trim() && tokens.length > 0 && hits.length < OR_FALLBACK_MIN_HITS) {
    const orHits = runUnifiedSearchPass(options, "or_fallback");
    if (orHits.length > hits.length) {
      hits = orHits;
      searchMode = "or_fallback";
    }
  }

  const categories = loadWorkCategoriesMaster().categories;

  return {
    query: options.query,
    engine: "keyword_unified_v1",
    searchMode,
    filters: {
      category: options.category || undefined,
      projectNo: options.projectNo || undefined,
      dateFrom: options.dateFrom || undefined,
      dateTo: options.dateTo || undefined,
      kinds: options.kinds,
    },
    total: hits.length,
    hits: hits.slice(0, limit),
    categories,
    kindCounts,
  };
}

export { buildQnapDeepLinksV1 } from "./knowledge-qnap-links-v1.js";

export const UNIFIED_KNOWLEDGE_KIND_LABELS_V1: Record<UnifiedKnowledgeKindV1, string> = {
  knowledge_card: "ナレッジカード",
  candidate: "候補",
  project: "案件",
  pdf: "PDF",
  photo: "写真",
  asset: "資産",
  plc: "PLC",
  esp: "ESP/RP",
  "3dprint": "3DPrint",
  factory: "Factory",
};

export function parseUnifiedKnowledgeKindsV1(raw: string): UnifiedKnowledgeKindV1[] {
  const allowed = new Set(Object.keys(UNIFIED_KNOWLEDGE_KIND_LABELS_V1));
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is UnifiedKnowledgeKindV1 => allowed.has(s));
}
