/** Knowledge Field UX V1 — 統合ナレッジ詳細（AI/RAG 未使用） */

import { getBusinessProject } from "../business/business-store.js";
import { buildMothershipKnowledgeRelativePath } from "./knowledge-paths-v1.js";
import { listKnowledgeAssetsV1 } from "./knowledge-assets-v1.js";
import { getKnowledgeCandidateV1 } from "./knowledge-candidates-store-v1.js";
import { getKnowledgeCardV1 } from "./knowledge-store-v1.js";
import {
  buildUnifiedKnowledgeSearchCorpusV1,
  type UnifiedKnowledgeKindV1,
} from "./unified-knowledge-search-v1.js";

export interface KnowledgeDetailRelatedV1 {
  id: string;
  kind: UnifiedKnowledgeKindV1;
  title: string;
  category: string;
}

export interface KnowledgeDetailV1 {
  id: string;
  kind: UnifiedKnowledgeKindV1;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  projectNo?: string;
  projectId?: string;
  customerName?: string;
  propertyName?: string;
  files: string[];
  qnapPath?: string;
  cautions?: string;
  procedure?: string;
  materials: string[];
  tools: string[];
  relatedKnowledge: KnowledgeDetailRelatedV1[];
  ladderDescription?: string;
  usage?: string;
  openUrl?: string;
  createdAt: string;
  hasPhoto: boolean;
  hasPdf: boolean;
  hasPlc: boolean;
  has3dPrint: boolean;
  status?: string;
}

function parseSection(summary: string, label: string): string | undefined {
  const re = new RegExp(`${label}[:：]\\s*([^\\n]+)`);
  return summary.match(re)?.[1]?.trim();
}

function buildQnapPath(
  kind: UnifiedKnowledgeKindV1,
  id: string,
  filePath?: string,
  projectNo?: string
): string | undefined {
  if (filePath?.startsWith("AI/")) return filePath;
  if (kind === "knowledge_card" || kind === "pdf" || kind === "photo" || kind === "esp") {
    return buildMothershipKnowledgeRelativePath("KnowledgeCards", `${id}.json`);
  }
  if (kind === "plc") {
    if (filePath) return `PLC/${filePath.replace(/^[/\\]+/, "")}`;
    return buildMothershipKnowledgeRelativePath("KnowledgeCards", `${id}.json`);
  }
  if (kind === "candidate") {
    return `AI/Candidates/${id}.json`;
  }
  if (kind === "3dprint" && filePath) {
    return `3DPrint/${filePath.replace(/^[/\\]+/, "")}`;
  }
  if (kind === "factory" && filePath) {
    return `Factory/${filePath.replace(/^[/\\]+/, "")}`;
  }
  if (kind === "project" && projectNo) {
    return `Projects/${projectNo}`;
  }
  return undefined;
}

function findRelated(
  id: string,
  category: string,
  tags: string[],
  limit = 6
): KnowledgeDetailRelatedV1[] {
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const related: KnowledgeDetailRelatedV1[] = [];

  for (const doc of buildUnifiedKnowledgeSearchCorpusV1()) {
    if (doc.id === id) continue;
    const sharedTag = doc.tags.some((t) => tagSet.has(t.toLowerCase()));
    if (doc.category !== category && !sharedTag) continue;
    related.push({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      category: doc.category,
    });
    if (related.length >= limit) break;
  }
  return related;
}

function resolveEffectiveKind(
  docKind: UnifiedKnowledgeKindV1,
  card: ReturnType<typeof getKnowledgeCardV1>
): UnifiedKnowledgeKindV1 {
  if (card?.sourceType === "plc-template") return "plc";
  if (card?.sourceType === "rp-template") return "esp";
  if (card?.sourceType === "pdf") return "pdf";
  if (card?.sourceType === "photo") return "photo";
  if (docKind === "knowledge_card" && card?.category === "PLC") return "plc";
  return docKind;
}

export function getKnowledgeDetailV1(
  id: string,
  kindHint?: UnifiedKnowledgeKindV1
): KnowledgeDetailV1 | null {
  const corpus = buildUnifiedKnowledgeSearchCorpusV1();
  let doc = corpus.find((d) => d.id === id && (!kindHint || d.kind === kindHint));
  if (!doc) doc = corpus.find((d) => d.id === id);
  if (!doc) return null;

  const card = getKnowledgeCardV1(id);
  const candidate = getKnowledgeCandidateV1(id);
  const asset = listKnowledgeAssetsV1().find((a) => a.id === id);
  const project = doc.projectId ? getBusinessProject(doc.projectId) : null;

  const summary = card?.summary ?? doc.body.slice(0, 800);
  const files = card?.files ?? (doc.filePath ? [doc.filePath] : []);
  const kind = resolveEffectiveKind(doc.kind, card);

  return {
    id: doc.id,
    kind,
    title: doc.title,
    summary,
    category: doc.category,
    tags: doc.tags ?? [],
    projectNo: doc.projectNo ?? project?.projectNo,
    projectId: doc.projectId ?? project?.id,
    customerName: doc.customerName ?? project?.customerName ?? card?.customerName,
    propertyName: doc.propertyName ?? project?.address,
    files,
    qnapPath: buildQnapPath(kind, doc.id, doc.filePath ?? files[0], doc.projectNo),
    cautions: doc.cautions ?? parseSection(summary, "注意点") ?? parseSection(summary, "注意"),
    procedure: parseSection(summary, "手順"),
    materials: parseSection(summary, "材料")?.split(/[、,]/).map((s) => s.trim()).filter(Boolean) ?? [],
    tools: parseSection(summary, "工具")?.split(/[、,]/).map((s) => s.trim()).filter(Boolean) ?? [],
    relatedKnowledge: findRelated(doc.id, doc.category, doc.tags ?? []),
    ladderDescription: doc.ladderDescription,
    usage: doc.usage,
    openUrl: doc.openUrl,
    createdAt: doc.createdAt,
    hasPhoto: kind === "photo" || Boolean(card?.photoMeta),
    hasPdf: kind === "pdf" || Boolean(card?.pdfMeta),
    hasPlc: kind === "plc" || card?.sourceType === "plc-template",
    has3dPrint: kind === "3dprint" || asset?.domain === "3DPrint",
    status: doc.status ?? candidate?.status,
  };
}
