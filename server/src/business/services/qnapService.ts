import { v4 as uuid } from "uuid";
import type { BusinessProject, QnapSavePlan } from "../business-types.js";

export const QNAP_FOLDER_NAMES = [
  "01_現調写真",
  "02_見積書",
  "03_施工写真",
  "04_完了報告書",
  "05_請求書",
  "06_入金資料",
] as const;

export type QnapFileType = "estimate" | "invoice" | "completion_report" | "survey_photo" | "construction_photo";

function sanitizeSegment(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim() || "案件";
}

export function generateQnapProjectPath(project: Pick<BusinessProject, "projectNo" | "customerName" | "title"> & { createdAt?: string }): string {
  const year = project.createdAt
    ? new Date(project.createdAt).getFullYear()
    : new Date().getFullYear();
  const folder = `${project.projectNo}_${sanitizeSegment(project.customerName)}_${sanitizeSegment(project.title)}`;
  return `/TOMS/案件/${year}/${folder}/`;
}

export function generateQnapFilePath(
  project: Pick<BusinessProject, "projectNo" | "customerName" | "title"> & { createdAt?: string },
  fileType: QnapFileType,
  docNo?: string
): string {
  const base = generateQnapProjectPath(project);
  const year = new Date().getFullYear();
  const no = docNo ?? project.projectNo.replace("PRJ-", "EST-").replace("PRJ", "EST");
  const suffix = sanitizeSegment(project.customerName);
  const title = sanitizeSegment(project.title);
  const fileName = (() => {
    switch (fileType) {
      case "estimate":
        return `${no.startsWith("EST") ? no : `EST-${year}-${project.projectNo.slice(-4)}`}_${suffix}_${title}.pdf`;
      case "invoice":
        return `INV-${year}-${project.projectNo.slice(-4)}_${suffix}_${title}.pdf`;
      case "completion_report":
        return `REP-${year}-${project.projectNo.slice(-4)}_${suffix}_${title}.pdf`;
      default:
        return `${project.projectNo}_${fileType}.jpg`;
    }
  })();
  const folder = (() => {
    switch (fileType) {
      case "estimate":
        return "02_見積書";
      case "invoice":
        return "05_請求書";
      case "completion_report":
        return "04_完了報告書";
      case "survey_photo":
        return "01_現調写真";
      case "construction_photo":
        return "03_施工写真";
    }
  })();
  return `${base}${folder}/${fileName}`;
}

export function createQnapSavePlan(project: BusinessProject): QnapSavePlan {
  const basePath = project.qnapBasePath || generateQnapProjectPath(project);
  const folders = QNAP_FOLDER_NAMES.map((f) => `${basePath}${f}/`);
  const files: Array<{ label: string; path: string }> = [
    { label: "見積PDF（予定）", path: generateQnapFilePath(project, "estimate") },
    { label: "請求PDF（予定）", path: generateQnapFilePath(project, "invoice") },
    { label: "完了報告PDF（予定）", path: generateQnapFilePath(project, "completion_report") },
  ];
  return {
    id: uuid(),
    projectId: project.id,
    basePath,
    folders,
    files,
    status: "planned",
    createdAt: new Date().toISOString(),
  };
}
