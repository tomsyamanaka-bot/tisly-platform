import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { BusinessProject, QnapSavePlan } from "../business-types.js";
import { businessUploadsDir } from "../business-store.js";

export const QNAP_BUSINESS_SUBFOLDERS = [
  "estimate",
  "invoice",
  "completion-report",
  "photos",
  "survey",
] as const;

/** @deprecated 旧フォルダ名 — 新パスと併記 */
export const QNAP_FOLDER_NAMES = [
  "01_現調写真",
  "02_見積書",
  "03_施工写真",
  "04_完了報告書",
  "05_請求書",
  "06_入金資料",
] as const;

export type QnapFileType =
  | "estimate"
  | "invoice"
  | "completion_report"
  | "survey_photo"
  | "construction_photo";

function sanitizeSegment(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim() || "案件";
}

/** /TOMS/business/{customer}/{projectId}/ */
export function generateQnapBusinessRoot(project: Pick<BusinessProject, "id" | "customerName">): string {
  const customer = sanitizeSegment(project.customerName);
  return `/TOMS/business/${customer}/${project.id}/`;
}

export function generateQnapProjectPath(
  project: Pick<BusinessProject, "id" | "projectNo" | "customerName" | "title"> & {
    createdAt?: string;
  }
): string {
  return generateQnapBusinessRoot(project as BusinessProject);
}

export function generateQnapSubfolderPath(
  project: Pick<BusinessProject, "id" | "customerName">,
  sub: (typeof QNAP_BUSINESS_SUBFOLDERS)[number]
): string {
  return `${generateQnapBusinessRoot(project as BusinessProject)}${sub}/`;
}

export function generateQnapFilePath(
  project: Pick<BusinessProject, "id" | "projectNo" | "customerName" | "title"> & {
    createdAt?: string;
  },
  fileType: QnapFileType,
  docNo?: string
): string {
  const base = generateQnapBusinessRoot(project as BusinessProject);
  const year = new Date().getFullYear();
  const suffix = sanitizeSegment(project.customerName);
  const title = sanitizeSegment(project.title);
  const fileName = (() => {
    switch (fileType) {
      case "estimate":
        return `${docNo ?? `EST-${year}-${project.id.slice(-4)}`}_${suffix}_${title}.pdf`;
      case "invoice":
        return `INV-${year}-${project.id.slice(-4)}_${suffix}_${title}.pdf`;
      case "completion_report":
        return `REP-${year}-${project.id.slice(-4)}_${suffix}_${title}.pdf`;
      default:
        return `${project.id}_${fileType}.jpg`;
    }
  })();
  const sub = (() => {
    switch (fileType) {
      case "estimate":
        return "estimate";
      case "invoice":
        return "invoice";
      case "completion_report":
        return "completion-report";
      case "survey_photo":
        return "survey";
      case "construction_photo":
        return "photos";
    }
  })();
  return `${base}${sub}/${fileName}`;
}

export function createQnapSavePlan(project: BusinessProject): QnapSavePlan {
  const basePath = project.qnapBasePath || generateQnapProjectPath(project);
  const folders = QNAP_BUSINESS_SUBFOLDERS.map((f) => `${basePath}${f}/`);
  const files: Array<{ label: string; path: string }> = [
    { label: "見積PDF", path: generateQnapFilePath(project, "estimate") },
    { label: "請求PDF", path: generateQnapFilePath(project, "invoice") },
    { label: "完了報告PDF", path: generateQnapFilePath(project, "completion_report") },
    { label: "現調写真", path: generateQnapSubfolderPath(project, "survey") },
    { label: "施工写真", path: generateQnapSubfolderPath(project, "photos") },
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

export interface QnapMockSaveResult {
  planId: string;
  basePath: string;
  savedFiles: Array<{ label: string; path: string; localMirror?: string }>;
  status: "synced";
}

export function mockSaveToQnap(
  project: BusinessProject,
  plan?: QnapSavePlan
): QnapMockSaveResult {
  const p = plan ?? createQnapSavePlan(project);
  const mirrorDir = businessUploadsDir(project.id, "qnap-mock");
  const savedFiles = p.files.map((f) => {
    const name = path.basename(f.path);
    const local = path.join(mirrorDir, name.replace(/\//g, "_"));
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, `QNAP mock placeholder\n${f.path}\n${new Date().toISOString()}\n`);
    return { ...f, localMirror: `/uploads/business/${project.id}/qnap-mock/${path.basename(local)}` };
  });
  return {
    planId: p.id,
    basePath: p.basePath,
    savedFiles,
    status: "synced",
  };
}
