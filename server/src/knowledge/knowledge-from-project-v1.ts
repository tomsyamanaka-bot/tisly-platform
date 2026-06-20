/** TiSLY Knowledge — 案件→Knowledge Card 変換 v1 */

import { getBusinessProject } from "../business/business-store.js";
import { listCompletionPhotosV1 } from "../estimate/completion-photos-store.js";
import {
  listProjectPdfsV1,
  type ProjectPdfKind,
} from "../projects/project-pdf-store.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import { getKnowledgeCardV1, listKnowledgeCardsV1, saveKnowledgeCardV1 } from "./knowledge-store-v1.js";
import type { KnowledgeCardV1, KnowledgeFromProjectResultV1 } from "./knowledge-types.js";
import { buildKnowledgePdfCardV1 } from "./knowledge-pdf-v1.js";
import { buildKnowledgePhotoCardV1 } from "./knowledge-photo-v1.js";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeProjectToken(projectNo: string): string {
  return String(projectNo ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

function inferCategoryFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/カメラ|防犯|cctv/.test(t)) return "防犯カメラ";
  if (/lan|vlan|配線/.test(t)) return "LAN";
  if (/wifi|wi-fi|無線/.test(t)) return "Wi-Fi";
  if (/plc|ラダー|制御/.test(t)) return "PLC";
  if (/エアコン|空調/.test(t)) return "エアコン";
  return "その他";
}

function buildProjectSummaryCard(project: NonNullable<ReturnType<typeof getBusinessProject>>): KnowledgeCardV1 {
  const token = safeProjectToken(project.projectNo);
  const id = `PROJ-${token}-SUMMARY-001`;
  const category = inferCategoryFromTitle(project.title);
  const tags = [
    "案件",
    project.projectNo,
    project.customerName,
    category,
  ].filter(Boolean);

  return saveKnowledgeCardV1({
    id,
    title: `${project.title}（案件ナレッジ）`,
    category,
    tags,
    summary: `${project.customerName} · ${project.address || "現場"} — 完了案件の概要。仕様書・完了報告・PDF・写真をナレッジ化。`,
    files: [],
    updatedAt: todayIsoDate(),
    sourceType: "project",
    relatedProjectIds: [project.id],
    projectNo: project.projectNo,
    customerName: project.customerName,
  });
}

const PDF_KIND_MAP: Record<ProjectPdfKind, "estimate" | "invoice" | "specification" | "report"> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  report: "report",
};

export function convertProjectToKnowledgeV1(projectId: string): KnowledgeFromProjectResultV1 {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  const cardsCreated: KnowledgeCardV1[] = [];
  const cardsSkipped: string[] = [];

  const summaryId = `PROJ-${safeProjectToken(project.projectNo)}-SUMMARY-001`;
  if (getKnowledgeCardV1(summaryId)) {
    cardsSkipped.push(summaryId);
  } else {
    cardsCreated.push(buildProjectSummaryCard(project));
  }

  const pdfs = listProjectPdfsV1(projectId);
  for (const pdf of pdfs) {
    if (!pdf.exists || !pdf.pdfPath) continue;
    const kind = pdf.kind as ProjectPdfKind;
    const cardId = `PROJ-${safeProjectToken(project.projectNo)}-PDF-${kind.toUpperCase()}-001`;
    if (getKnowledgeCardV1(cardId)) {
      cardsSkipped.push(cardId);
      continue;
    }
    cardsCreated.push(
      buildKnowledgePdfCardV1({
        projectId,
        projectNo: project.projectNo,
        customerName: project.customerName,
        category: inferCategoryFromTitle(project.title),
        kind: PDF_KIND_MAP[kind],
        fileName: pdf.fileName ?? "document.pdf",
        localPath: pdf.pdfPath,
        cardId,
      })
    );
  }

  if (project.surveyProjectId) {
    const surveyPhotos = listSurveyPhotosV1(project.surveyProjectId).filter(
      (p) => !String(p.url ?? "").includes("_memo:")
    );
    surveyPhotos.forEach((photo, idx) => {
      const seq = String(idx + 1).padStart(3, "0");
      const cardId = `PROJ-${safeProjectToken(project.projectNo)}-SURVEY-${seq}`;
      if (getKnowledgeCardV1(cardId)) {
        cardsSkipped.push(cardId);
        return;
      }
      cardsCreated.push(
        buildKnowledgePhotoCardV1({
          projectId,
          projectNo: project.projectNo,
          customerName: project.customerName,
          category: inferCategoryFromTitle(project.title),
          photoKind: "survey",
          photoId: photo.id,
          title: photo.title || photo.comment || photo.photoType || `現調写真${idx + 1}`,
          tags: [project.projectNo, "現調", photo.photoType].filter(Boolean),
          url: photo.url,
          cardId,
        })
      );
    });
  }

  const completionPhotos = listCompletionPhotosV1(projectId);
  completionPhotos.forEach((photo, idx) => {
    const seq = String(idx + 1).padStart(3, "0");
    const cardId = `PROJ-${safeProjectToken(project.projectNo)}-COMP-${seq}`;
    if (getKnowledgeCardV1(cardId)) {
      cardsSkipped.push(cardId);
      return;
    }
    cardsCreated.push(
      buildKnowledgePhotoCardV1({
        projectId,
        projectNo: project.projectNo,
        customerName: project.customerName,
        category: inferCategoryFromTitle(project.title),
        photoKind: "completion",
        photoId: photo.id,
        title: photo.title || `完了写真${idx + 1}`,
        tags: [project.projectNo, "完了報告"],
        url: photo.url,
        cardId,
      })
    );
  });

  return {
    projectId,
    projectNo: project.projectNo,
    cardsCreated,
    cardsSkipped,
    qnapQueued: cardsCreated.length,
  };
}

export function getProjectKnowledgeStatusV1(projectId: string): {
  registered: boolean;
  cardCount: number;
  summaryCardId: string | null;
} {
  const project = getBusinessProject(projectId);
  if (!project) return { registered: false, cardCount: 0, summaryCardId: null };
  const summaryId = `PROJ-${safeProjectToken(project.projectNo)}-SUMMARY-001`;
  const summary = getKnowledgeCardV1(summaryId);
  const prefix = `PROJ-${safeProjectToken(project.projectNo)}`;
  const related = listKnowledgeCardsV1().filter((c) => c.id.startsWith(prefix));
  return {
    registered: Boolean(summary),
    cardCount: related.length,
    summaryCardId: summary?.id ?? null,
  };
}
