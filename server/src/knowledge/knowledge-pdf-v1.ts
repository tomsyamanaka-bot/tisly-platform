/** TiSLY Knowledge — PDFナレッジ v1 */

import { listKnowledgeCardsV1, saveKnowledgeCardV1 } from "./knowledge-store-v1.js";
import type { KnowledgeCardV1, KnowledgePdfKindV1 } from "./knowledge-types.js";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const PDF_KIND_LABELS: Record<KnowledgePdfKindV1, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  report: "完了報告書",
};

const PDF_FOLDER: Record<KnowledgePdfKindV1, string> = {
  estimate: "Documents/estimates",
  invoice: "Documents/invoices",
  specification: "Documents/specifications",
  report: "Reports/completion-report",
};

export interface KnowledgePdfCardInputV1 {
  projectId: string;
  projectNo: string;
  customerName: string;
  category: string;
  kind: KnowledgePdfKindV1;
  fileName: string;
  localPath: string;
  cardId: string;
}

export function buildKnowledgePdfCardV1(input: KnowledgePdfCardInputV1): KnowledgeCardV1 {
  const label = PDF_KIND_LABELS[input.kind];
  return saveKnowledgeCardV1({
    id: input.cardId,
    title: `${label} — ${input.projectNo}`,
    category: input.category,
    tags: [label, input.projectNo, input.customerName, "PDF"],
    summary: `${input.customerName} · 案件 ${input.projectNo} の${label}。`,
    files: [`${PDF_FOLDER[input.kind]}/${input.fileName}`],
    updatedAt: todayIsoDate(),
    sourceType: "pdf",
    relatedProjectIds: [input.projectId],
    projectNo: input.projectNo,
    customerName: input.customerName,
    pdfMeta: {
      kind: input.kind,
      fileName: input.fileName,
      localPath: input.localPath,
      projectId: input.projectId,
      customerName: input.customerName,
    },
  });
}

export function registerProjectPdfKnowledgeV1(input: Omit<KnowledgePdfCardInputV1, "cardId">): KnowledgeCardV1 {
  const token = input.projectNo.replace(/[^A-Z0-9]/gi, "").slice(0, 16).toUpperCase();
  const cardId = `PDF-${token}-${input.kind.toUpperCase()}-001`;
  return buildKnowledgePdfCardV1({ ...input, cardId });
}

export function searchPdfKnowledgeV1(query: string): KnowledgeCardV1[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listKnowledgeCardsV1().filter((c) => {
    if (c.sourceType !== "pdf") return false;
    const hay = [
      c.title,
      c.category,
      ...(c.tags ?? []),
      c.summary,
      c.projectNo ?? "",
      c.customerName ?? "",
      c.pdfMeta?.kind ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
