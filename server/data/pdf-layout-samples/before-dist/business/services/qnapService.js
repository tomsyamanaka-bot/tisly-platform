import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { businessUploadsDir } from "../business-store.js";
/** 案件フォルダ内の標準サブフォルダ（TOMS実運用パス） */
export const QNAP_CASE_FOLDERS = [
    "01_現調写真",
    "02_見積書",
    "03_施工写真",
    "04_完了報告書",
    "05_請求書",
    "06_入金資料",
    "07_仕様書",
];
/** @deprecated WebDAV mock 互換サブフォルダ */
export const QNAP_BUSINESS_SUBFOLDERS = [
    "estimate",
    "invoice",
    "completion-report",
    "photos",
    "survey",
    "specification",
];
export const QNAP_FOLDER_NAMES = QNAP_CASE_FOLDERS;
function sanitizeSegment(s) {
    return s.replace(/[/\\:*?"<>|]/g, "_").trim() || "案件";
}
/** /TOMS/案件/{year}/{projectNo}_{customerName}_{title}/ */
export function generateQnapProjectCaseRoot(project) {
    const year = project.createdAt
        ? new Date(project.createdAt).getFullYear()
        : new Date().getFullYear();
    const segment = `${sanitizeSegment(project.projectNo)}_${sanitizeSegment(project.customerName)}_${sanitizeSegment(project.title)}`;
    return `/TOMS/案件/${year}/${segment}/`;
}
/** 案件ルート（Phase601+ 標準パス） */
export function generateQnapBusinessRoot(project) {
    if (project.projectNo && project.title) {
        return generateQnapProjectCaseRoot(project);
    }
    const customer = sanitizeSegment(project.customerName);
    return `/TOMS/business/${customer}/${project.id}/`;
}
export function generateQnapProjectPath(project) {
    return generateQnapBusinessRoot(project);
}
export function generateQnapSubfolderPath(project, sub) {
    return `${generateQnapBusinessRoot(project)}${sub}/`;
}
export function generateQnapFilePath(project, fileType, docNo) {
    const base = generateQnapBusinessRoot(project);
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
    return `${base}${sub}/${fileName}`;
}
export function generateQnapCaseSubfolderPath(project, sub) {
    return `${generateQnapBusinessRoot(project)}${sub}/`;
}
export function generateQnapSpecificationFolderPath(project) {
    return generateQnapCaseSubfolderPath(project, "07_仕様書");
}
export function generateQnapSpecificationFilePath(project) {
    const suffix = sanitizeSegment(project.customerName);
    const title = sanitizeSegment(project.title);
    const no = sanitizeSegment(project.projectNo);
    return `${generateQnapSpecificationFolderPath(project)}SPEC-${no}_${suffix}_${title}.pdf`;
}
export function createQnapSavePlan(project) {
    const basePath = project.qnapBasePath || generateQnapProjectPath(project);
    const folders = QNAP_CASE_FOLDERS.map((f) => `${basePath}${f}/`);
    const files = [
        { label: "見積PDF", path: generateQnapFilePath(project, "estimate") },
        { label: "請求PDF", path: generateQnapFilePath(project, "invoice") },
        { label: "完了報告PDF", path: generateQnapFilePath(project, "completion_report") },
        { label: "現調写真", path: generateQnapCaseSubfolderPath(project, "01_現調写真") },
        { label: "施工写真", path: generateQnapCaseSubfolderPath(project, "03_施工写真") },
        { label: "仕様書", path: generateQnapSpecificationFilePath(project) },
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
export function mockSaveToQnap(project, plan) {
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
