/** Knowledge Field UX V2 — 統合ナレッジ詳細（AI/RAG 未使用） */

import { getBusinessProject } from "../business/business-store.js";
import { buildAttachmentV1, type KnowledgeAttachmentV1 } from "./knowledge-attachments-v1.js";
import { enrichAttachmentWithDelivery } from "./knowledge-file-delivery-v1.js";
import { buildMothershipKnowledgeRelativePath } from "./knowledge-paths-v1.js";
import { buildQnapDeepLinksV1, type QnapDeepLinksV1 } from "./knowledge-qnap-links-v1.js";
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

export interface KnowledgeDetailProjectLinkV1 {
  projectNo: string;
  projectId?: string;
  title: string;
  openUrl?: string;
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
  qnapLinks?: QnapDeepLinksV1;
  cautions?: string;
  procedure?: string;
  materials: string[];
  tools: string[];
  relatedKnowledge: KnowledgeDetailRelatedV1[];
  relatedPhotos: KnowledgeAttachmentV1[];
  relatedPdfs: KnowledgeAttachmentV1[];
  relatedProjects: KnowledgeDetailProjectLinkV1[];
  relatedPlc: KnowledgeAttachmentV1[];
  related3dPrint: KnowledgeAttachmentV1[];
  attachments: KnowledgeAttachmentV1[];
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

function buildAttachmentsForDetail(input: {
  kind: UnifiedKnowledgeKindV1;
  files: string[];
  qnapPath?: string;
  openUrl?: string;
  card: ReturnType<typeof getKnowledgeCardV1>;
  asset: ReturnType<typeof listKnowledgeAssetsV1>[number] | undefined;
}): {
  relatedPhotos: KnowledgeAttachmentV1[];
  relatedPdfs: KnowledgeAttachmentV1[];
  relatedPlc: KnowledgeAttachmentV1[];
  related3dPrint: KnowledgeAttachmentV1[];
  attachments: KnowledgeAttachmentV1[];
} {
  const relatedPhotos: KnowledgeAttachmentV1[] = [];
  const relatedPdfs: KnowledgeAttachmentV1[] = [];
  const relatedPlc: KnowledgeAttachmentV1[] = [];
  const related3dPrint: KnowledgeAttachmentV1[] = [];
  const attachments: KnowledgeAttachmentV1[] = [];

  if (input.kind === "photo" && input.card?.photoMeta?.url) {
    const att = buildAttachmentV1({
      sourcePath: input.card.photoMeta.url,
      qnapPath: input.qnapPath,
      openUrl: input.openUrl ?? input.card.photoMeta.url,
      label: input.card.title,
      previewUrl: input.card.photoMeta.url,
      fileType: "photo",
    });
    relatedPhotos.push(att);
    attachments.push(att);
  }

  if (input.kind === "pdf" && input.openUrl) {
    const att = buildAttachmentV1({
      sourcePath: input.files[0] ?? input.openUrl,
      qnapPath: input.qnapPath,
      openUrl: input.openUrl,
      label: input.card?.title ?? "PDF",
      fileType: "pdf",
    });
    relatedPdfs.push(att);
    attachments.push(att);
  }

  if (input.kind === "plc" || input.card?.sourceType === "plc-template") {
    const att = buildAttachmentV1({
      sourcePath: input.files[0] ?? `PLC/Templates/${input.card?.id ?? "template"}`,
      qnapPath: input.qnapPath,
      openUrl: input.openUrl,
      label: input.card?.title ?? "PLCテンプレ",
      fileType: "other",
    });
    relatedPlc.push(att);
    attachments.push(att);
  }

  if (input.kind === "3dprint" || input.asset?.domain === "3DPrint") {
    const fmt = input.asset?.fileFormats?.[0]?.toLowerCase();
    const fileType =
      fmt === "stl" ? "stl" : fmt === "step" || fmt === "stp" ? "step" : fmt === "gcode" ? "gcode" : "other";
    const att = buildAttachmentV1({
      sourcePath: input.asset?.relativePath ?? input.files[0] ?? "",
      qnapPath: input.qnapPath,
      openUrl: input.openUrl,
      label: input.asset?.title ?? input.files[0] ?? "3DPrint",
      fileType,
    });
    related3dPrint.push(att);
    attachments.push(att);
  }

  for (const file of input.files) {
    if (attachments.some((a) => a.sourcePath === file)) continue;
    attachments.push(
      buildAttachmentV1({
        sourcePath: file,
        qnapPath: file.startsWith("AI/") ? file : input.qnapPath,
        label: file.split(/[/\\]/).pop() ?? file,
      })
    );
  }

  return { relatedPhotos, relatedPdfs, relatedPlc, related3dPrint, attachments };
}

function enrichAttachments(groups: {
  relatedPhotos: KnowledgeAttachmentV1[];
  relatedPdfs: KnowledgeAttachmentV1[];
  relatedPlc: KnowledgeAttachmentV1[];
  related3dPrint: KnowledgeAttachmentV1[];
  attachments: KnowledgeAttachmentV1[];
}) {
  return {
    relatedPhotos: groups.relatedPhotos.map(enrichAttachmentWithDelivery),
    relatedPdfs: groups.relatedPdfs.map(enrichAttachmentWithDelivery),
    relatedPlc: groups.relatedPlc.map(enrichAttachmentWithDelivery),
    related3dPrint: groups.related3dPrint.map(enrichAttachmentWithDelivery),
    attachments: groups.attachments.map(enrichAttachmentWithDelivery),
  };
}

function buildRelatedProjects(
  projectNo?: string,
  projectId?: string,
  title?: string
): KnowledgeDetailProjectLinkV1[] {
  if (!projectNo && !projectId) return [];
  const project = projectId ? getBusinessProject(projectId) : null;
  const no = projectNo ?? project?.projectNo;
  if (!no) return [];
  return [
    {
      projectNo: no,
      projectId: projectId ?? project?.id,
      title: project?.title ?? title ?? no,
      openUrl: `/projects-v1?projectId=${encodeURIComponent(projectId ?? project?.id ?? "")}`,
    },
  ];
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
  const qnapPath = buildQnapPath(kind, doc.id, doc.filePath ?? files[0], doc.projectNo);
  const qnapLinks = qnapPath ? buildQnapDeepLinksV1(qnapPath) : undefined;
  const attachmentGroups = enrichAttachments(
    buildAttachmentsForDetail({
      kind,
      files,
      qnapPath,
      openUrl: doc.openUrl,
      card,
      asset,
    })
  );

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
    qnapPath,
    qnapLinks,
    cautions: doc.cautions ?? parseSection(summary, "注意点") ?? parseSection(summary, "注意"),
    procedure: parseSection(summary, "手順"),
    materials: parseSection(summary, "材料")?.split(/[、,]/).map((s) => s.trim()).filter(Boolean) ?? [],
    tools: parseSection(summary, "工具")?.split(/[、,]/).map((s) => s.trim()).filter(Boolean) ?? [],
    relatedKnowledge: findRelated(doc.id, doc.category, doc.tags ?? []),
    relatedPhotos: attachmentGroups.relatedPhotos,
    relatedPdfs: attachmentGroups.relatedPdfs,
    relatedProjects: buildRelatedProjects(doc.projectNo ?? project?.projectNo, doc.projectId ?? project?.id, doc.title),
    relatedPlc: attachmentGroups.relatedPlc,
    related3dPrint: attachmentGroups.related3dPrint,
    attachments: attachmentGroups.attachments,
    ladderDescription: doc.ladderDescription,
    usage: doc.usage,
    openUrl: doc.openUrl,
    createdAt: doc.createdAt,
    hasPhoto: kind === "photo" || Boolean(card?.photoMeta) || attachmentGroups.relatedPhotos.length > 0,
    hasPdf: kind === "pdf" || Boolean(card?.pdfMeta) || attachmentGroups.relatedPdfs.length > 0,
    hasPlc: kind === "plc" || card?.sourceType === "plc-template" || attachmentGroups.relatedPlc.length > 0,
    has3dPrint: kind === "3dprint" || asset?.domain === "3DPrint" || attachmentGroups.related3dPrint.length > 0,
    status: doc.status ?? candidate?.status,
  };
}

export { buildQnapDeepLinksV1, type QnapDeepLinksV1, type KnowledgeAttachmentV1 };
