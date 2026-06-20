/** TiSLY Knowledge Automation Engine v1 — 案件ステージ連動・候補生成 */

import { getBusinessProject } from "../business/business-store.js";
import type { BusinessProjectStatus } from "../business/business-types.js";
import { listCompletionPhotosV1 } from "../estimate/completion-photos-store.js";
import { listProjectPdfsV1 } from "../projects/project-pdf-store.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import type { KnowledgeAutomationStageV1, KnowledgeCandidateV1 } from "./knowledge-automation-types.js";
import { saveKnowledgeCandidateV1 } from "./knowledge-candidates-store-v1.js";
import {
  buildPdfCandidateSummaryV1,
  buildPdfCandidateTagsV1,
  buildPdfCandidateTitleV1,
  parseProjectPdfKnowledgeV1,
} from "./knowledge-pdf-parser-v1.js";
import {
  buildOcrCandidateSummaryV1,
  buildOcrCandidateTagsV1,
  runPhotoOcrV1,
} from "./knowledge-photo-ocr-v1.js";

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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function businessStatusToAutomationStageV1(
  status: BusinessProjectStatus | string
): KnowledgeAutomationStageV1 | null {
  const s = String(status);
  if (s === "new") return "project_created";
  if (s === "survey_scheduled" || s === "survey_done") return "survey";
  if (
    s === "estimate_created" ||
    s === "estimate_sent" ||
    s === "estimate_sent_to_owner" ||
    s === "accepted"
  ) {
    return "estimate";
  }
  if (s === "construction_scheduled") return "construction";
  if (
    s === "construction_done" ||
    s === "completion_report_created" ||
    s === "invoice_created" ||
    s === "invoice_sent" ||
    s === "paid" ||
    s === "closed"
  ) {
    return "completed";
  }
  return null;
}

function buildStageSummaryCandidate(
  project: NonNullable<ReturnType<typeof getBusinessProject>>,
  stage: KnowledgeAutomationStageV1
): KnowledgeCandidateV1 {
  const token = safeProjectToken(project.projectNo);
  const category = inferCategoryFromTitle(project.title);
  const cardId = `AUTO-${token}-${stage.toUpperCase()}-001`;
  const stageLabel =
    stage === "project_created"
      ? "案件作成"
      : stage === "survey"
        ? "現調"
        : stage === "estimate"
          ? "見積"
          : stage === "construction"
            ? "施工"
            : "完了";

  return saveKnowledgeCandidateV1({
    source: "project_stage",
    stage,
    projectId: project.id,
    projectNo: project.projectNo,
    customerName: project.customerName,
    title: `${project.title}（${stageLabel}ナレッジ候補）`,
    category,
    tags: ["自動収集", stageLabel, project.projectNo, project.customerName, category],
    summary: `${project.customerName} · ${project.address || "現場"} — ${stageLabel}タイミングで自動生成されたナレッジ候補。`,
    draft: {
      id: cardId,
      title: `${project.title}（${stageLabel}）`,
      category,
      tags: [stageLabel, project.projectNo, project.customerName],
      summary: `${project.customerName} · 案件 ${project.projectNo} の${stageLabel}ナレッジ。`,
      files: [],
      updatedAt: todayIsoDate(),
      sourceType: "project",
      relatedProjectIds: [project.id],
      projectNo: project.projectNo,
      customerName: project.customerName,
    },
  });
}

function buildPdfParseCandidates(projectId: string): KnowledgeCandidateV1[] {
  const project = getBusinessProject(projectId);
  if (!project) return [];
  const pdfs = listProjectPdfsV1(projectId).filter((p) => p.exists && p.pdfPath);
  const kinds: Array<"estimate" | "invoice" | "specification" | "report"> = [];
  for (const pdf of pdfs) {
    const k = pdf.kind as "estimate" | "invoice" | "specification" | "report";
    if (!kinds.includes(k)) kinds.push(k);
  }
  const created: KnowledgeCandidateV1[] = [];
  for (const kind of kinds) {
    const extract = parseProjectPdfKnowledgeV1({ projectId, pdfKind: kind });
    const token = safeProjectToken(project.projectNo);
    const cardId = `AUTO-${token}-PDF-${kind.toUpperCase()}-001`;
    created.push(
      saveKnowledgeCandidateV1({
        source: "pdf_parse",
        stage: "estimate",
        projectId: project.id,
        projectNo: project.projectNo,
        customerName: project.customerName,
        title: buildPdfCandidateTitleV1(extract),
        category: extract.category,
        tags: buildPdfCandidateTagsV1(extract),
        summary: buildPdfCandidateSummaryV1(extract),
        pdfExtract: extract,
        draft: {
          id: cardId,
          title: buildPdfCandidateTitleV1(extract),
          category: extract.category,
          tags: buildPdfCandidateTagsV1(extract),
          summary: buildPdfCandidateSummaryV1(extract),
          files: extract.fileName ? [`Documents/${kind}/${extract.fileName}`] : [],
          updatedAt: todayIsoDate(),
          sourceType: "pdf",
          relatedProjectIds: [project.id],
          projectNo: project.projectNo,
          customerName: project.customerName,
          pdfMeta: extract.localPath
            ? {
                kind,
                fileName: extract.fileName ?? "document.pdf",
                localPath: extract.localPath,
                projectId: project.id,
                customerName: project.customerName,
              }
            : undefined,
        },
      })
    );
  }
  return created;
}

async function buildPhotoOcrCandidates(projectId: string): Promise<KnowledgeCandidateV1[]> {
  const project = getBusinessProject(projectId);
  if (!project) return [];
  const created: KnowledgeCandidateV1[] = [];
  const token = safeProjectToken(project.projectNo);
  const category = inferCategoryFromTitle(project.title);

  const ocrTargets: Array<{
    photoKind: "survey" | "completion";
    photoId: string;
    title: string;
    comment?: string;
    url?: string;
    seq: number;
  }> = [];

  if (project.surveyProjectId) {
    listSurveyPhotosV1(project.surveyProjectId)
      .filter((p) => !String(p.url ?? "").includes("_memo:"))
      .forEach((photo, idx) => {
        const title = photo.title || photo.comment || photo.photoType || "";
        if (/盤|ラベル|型番|label|panel|rack|breaker|型式/i.test(title)) {
          ocrTargets.push({
            photoKind: "survey",
            photoId: photo.id,
            title,
            comment: photo.comment ?? undefined,
            url: photo.url ?? undefined,
            seq: idx + 1,
          });
        }
      });
  }

  listCompletionPhotosV1(projectId).forEach((photo, idx) => {
    const title = photo.title || "";
    if (/盤|ラベル|型番|label|panel|rack|breaker|型式|施工/i.test(title)) {
      ocrTargets.push({
        photoKind: "completion",
        photoId: photo.id,
        title,
        url: photo.url,
        seq: idx + 1,
      });
    }
  });

  for (const target of ocrTargets) {
    const extract = await runPhotoOcrV1({
      photoId: target.photoId,
      photoKind: target.photoKind,
      title: target.title,
      comment: target.comment,
      url: target.url,
    });
    const hasSignal =
      extract.modelNumbers.length ||
      extract.partNumbers.length ||
      extract.breakerCapacities.length ||
      extract.deviceNames.length;
    if (!hasSignal && !target.title) continue;

    const kindTag = target.photoKind === "survey" ? "SURVEY" : "COMP";
    const cardId = `AUTO-${token}-OCR-${kindTag}-${String(target.seq).padStart(3, "0")}`;
    created.push(
      saveKnowledgeCandidateV1({
        source: "photo_ocr",
        stage: "completed",
        projectId: project.id,
        projectNo: project.projectNo,
        customerName: project.customerName,
        title: `写真OCR — ${target.title || `写真${target.seq}`}（${project.projectNo}）`,
        category,
        tags: buildOcrCandidateTagsV1(extract, project.projectNo),
        summary: buildOcrCandidateSummaryV1(extract),
        ocrExtract: extract,
        draft: {
          id: cardId,
          title: target.title || `写真ナレッジ ${target.seq}`,
          category,
          tags: buildOcrCandidateTagsV1(extract, project.projectNo),
          summary: buildOcrCandidateSummaryV1(extract),
          files: [],
          updatedAt: todayIsoDate(),
          sourceType: "photo",
          relatedProjectIds: [project.id],
          projectNo: project.projectNo,
          customerName: project.customerName,
          photoMeta: {
            photoId: target.photoId,
            photoKind: target.photoKind,
            title: target.title,
            tags: buildOcrCandidateTagsV1(extract, project.projectNo),
            url: target.url,
          },
        },
      })
    );
  }
  return created;
}

export async function runKnowledgeAutomationForProjectV1(
  projectId: string,
  triggerStatus?: BusinessProjectStatus | string
): Promise<{ stage: KnowledgeAutomationStageV1 | null; candidates: KnowledgeCandidateV1[] }> {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");

  const stage = businessStatusToAutomationStageV1(triggerStatus ?? project.status);
  if (!stage) return { stage: null, candidates: [] };

  const candidates: KnowledgeCandidateV1[] = [];
  candidates.push(buildStageSummaryCandidate(project, stage));

  if (stage === "estimate" || stage === "completed") {
    candidates.push(...buildPdfParseCandidates(projectId));
  }
  if (stage === "completed") {
    candidates.push(...(await buildPhotoOcrCandidates(projectId)));
  }

  return { stage, candidates };
}

export async function runKnowledgeAutomationOnStatusChangeV1(
  projectId: string,
  toStatus: BusinessProjectStatus | string
): Promise<{ stage: KnowledgeAutomationStageV1 | null; candidates: KnowledgeCandidateV1[] }> {
  return runKnowledgeAutomationForProjectV1(projectId, toStatus);
}

export function triggerKnowledgeAutomationOnProjectCreatedV1(projectId: string): void {
  void runKnowledgeAutomationForProjectV1(projectId, "new").catch((e) => {
    console.error("[knowledge-automation] project created:", e);
  });
}
