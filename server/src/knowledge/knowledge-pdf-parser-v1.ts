/** TiSLY Knowledge Automation Engine v1 — PDF ルールベース解析（AI 不使用） */

import { getBusinessProject, getEstimate, getInvoice, getCompletionReport } from "../business/business-store.js";
import { listProjectPdfsV1, type ProjectPdfKind } from "../projects/project-pdf-store.js";
import { listSurveyMaterialsV1, listSurveyIpEquipmentV1 } from "../survey/survey-v1-store.js";
import type { KnowledgePdfExtractV1 } from "./knowledge-automation-types.js";

const EQUIPMENT_CATEGORIES = new Set(["equipment", "機器", "カメラ", "防犯", "nvr", "recorder"]);
const MATERIAL_CATEGORIES = new Set(["material", "部材", "材料", "ケーブル", "配管", "consumable"]);

function inferCategoryFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/カメラ|防犯|cctv/.test(t)) return "防犯カメラ";
  if (/lan|vlan|配線/.test(t)) return "LAN";
  if (/wifi|wi-fi|無線/.test(t)) return "Wi-Fi";
  if (/plc|ラダー|制御/.test(t)) return "PLC";
  if (/エアコン|空調/.test(t)) return "エアコン";
  return "その他";
}

function isEquipmentLine(category: string, name: string): boolean {
  const c = category.toLowerCase();
  const n = name.toLowerCase();
  if (EQUIPMENT_CATEGORIES.has(c)) return true;
  return /カメラ|nvr|recorder|スイッチ|hub|ルータ|盤|panel|recorder/.test(n);
}

function isMaterialLine(category: string, name: string): boolean {
  const c = category.toLowerCase();
  if (MATERIAL_CATEGORIES.has(c)) return true;
  return /ケーブル|配管|モール|cv|utp|lan|cable|部材|材料|tape|テープ/.test(name.toLowerCase());
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function collectNotes(project: NonNullable<ReturnType<typeof getBusinessProject>>): string[] {
  const notes: string[] = [];
  if (project.surveyMemo?.trim()) notes.push(project.surveyMemo.trim());
  if (project.constructionMemo?.trim()) notes.push(project.constructionMemo.trim());
  if (project.requiredMaterials?.trim()) notes.push(project.requiredMaterials.trim());
  if (project.completionReportId) {
    const report = getCompletionReport(project.completionReportId);
    if (report?.workMemo?.trim()) notes.push(report.workMemo.trim());
  }
  return uniqueStrings(notes);
}

function collectFromEstimateItems(projectId: string): { equipment: string[]; materials: string[] } {
  const project = getBusinessProject(projectId);
  if (!project?.estimateId) return { equipment: [], materials: [] };
  const est = getEstimate(project.estimateId);
  if (!est?.items?.length) return { equipment: [], materials: [] };
  const equipment: string[] = [];
  const materials: string[] = [];
  for (const item of est.items) {
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const cat = String(item.category ?? "");
    if (isEquipmentLine(cat, name)) equipment.push(name);
    else if (isMaterialLine(cat, name)) materials.push(name);
    else if (item.memo?.trim()) materials.push(`${name}（${item.memo.trim()}）`);
  }
  return { equipment: uniqueStrings(equipment), materials: uniqueStrings(materials) };
}

function collectFromSurvey(project: NonNullable<ReturnType<typeof getBusinessProject>>): {
  equipment: string[];
  materials: string[];
} {
  const equipment: string[] = [];
  const materials: string[] = [];
  if (!project.surveyProjectId) return { equipment, materials };

  for (const eq of listSurveyIpEquipmentV1(project.surveyProjectId)) {
    const label = [eq.deviceName, eq.deviceType, eq.location].filter(Boolean).join(" · ");
    if (label) equipment.push(label);
  }
  for (const mat of listSurveyMaterialsV1(project.surveyProjectId)) {
    const label = [mat.itemLabel, mat.memo].filter(Boolean).join(" · ");
    if (label) materials.push(label);
  }
  return { equipment: uniqueStrings(equipment), materials: uniqueStrings(materials) };
}

export function parseProjectPdfKnowledgeV1(input: {
  projectId: string;
  pdfKind: "estimate" | "invoice" | "specification" | "report";
}): KnowledgePdfExtractV1 {
  const project = getBusinessProject(input.projectId);
  if (!project) throw new Error("project not found");

  const category = inferCategoryFromTitle(project.title);
  const fromEstimate = collectFromEstimateItems(project.id);
  const fromSurvey = collectFromSurvey(project);
  const notes = collectNotes(project);

  let extraEquipment: string[] = [];
  let extraMaterials: string[] = [];

  if (input.pdfKind === "estimate" && project.estimateId) {
    const est = getEstimate(project.estimateId);
    if (est?.shuseiDiscountMemo?.trim()) notes.push(est.shuseiDiscountMemo.trim());
  }
  if (input.pdfKind === "invoice" && project.invoiceId) {
    const inv = getInvoice(project.invoiceId);
    if (inv?.items?.length) {
      for (const item of inv.items) {
        const name = String(item.name ?? "").trim();
        if (!name) continue;
        if (isEquipmentLine(String(item.category ?? ""), name)) extraEquipment.push(name);
        else extraMaterials.push(name);
      }
    }
  }

  const pdfs = listProjectPdfsV1(project.id);
  const kindMap: Record<string, ProjectPdfKind> = {
    estimate: "estimate",
    invoice: "invoice",
    specification: "specification",
    report: "report",
  };
  const pdfMeta = pdfs.find((p) => p.kind === kindMap[input.pdfKind]);

  return {
    projectNo: project.projectNo,
    customerName: project.customerName,
    category,
    equipmentNames: uniqueStrings([...fromSurvey.equipment, ...fromEstimate.equipment, ...extraEquipment]),
    materialNames: uniqueStrings([...fromSurvey.materials, ...fromEstimate.materials, ...extraMaterials]),
    notes: uniqueStrings(notes),
    pdfKind: input.pdfKind,
    fileName: pdfMeta?.fileName ?? undefined,
    localPath: pdfMeta?.pdfPath ?? undefined,
  };
}

export function buildPdfCandidateSummaryV1(extract: KnowledgePdfExtractV1): string {
  const parts: string[] = [
    `${extract.customerName} · 案件 ${extract.projectNo}`,
    extract.equipmentNames.length ? `機器: ${extract.equipmentNames.slice(0, 8).join("、")}` : "",
    extract.materialNames.length ? `材料: ${extract.materialNames.slice(0, 8).join("、")}` : "",
    extract.notes.length ? `備考: ${extract.notes.slice(0, 2).join(" / ")}` : "",
  ].filter(Boolean);
  return parts.join(" — ");
}

const PDF_KIND_LABELS: Record<KnowledgePdfExtractV1["pdfKind"] & string, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  report: "完了報告書",
};

export function buildPdfCandidateTitleV1(extract: KnowledgePdfExtractV1): string {
  const label = extract.pdfKind ? PDF_KIND_LABELS[extract.pdfKind] : "PDF";
  return `${label} — ${extract.projectNo}（自動解析）`;
}

export function buildPdfCandidateTagsV1(extract: KnowledgePdfExtractV1): string[] {
  const tags = [
    "自動収集",
    extract.projectNo,
    extract.customerName,
    extract.category,
    extract.pdfKind ? PDF_KIND_LABELS[extract.pdfKind] : "PDF",
    ...extract.equipmentNames.slice(0, 5),
    ...extract.materialNames.slice(0, 5),
  ];
  return uniqueStrings(tags);
}
