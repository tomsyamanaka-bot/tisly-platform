import type { BusinessProject, QnapSavePlan } from "../business-types.js";
/** 案件フォルダ内の標準サブフォルダ（TOMS実運用パス） */
export declare const QNAP_CASE_FOLDERS: readonly ["01_現調写真", "02_見積書", "03_施工写真", "04_完了報告書", "05_請求書", "06_入金資料", "07_仕様書"];
/** @deprecated WebDAV mock 互換サブフォルダ */
export declare const QNAP_BUSINESS_SUBFOLDERS: readonly ["estimate", "invoice", "completion-report", "photos", "survey", "specification"];
export declare const QNAP_FOLDER_NAMES: readonly ["01_現調写真", "02_見積書", "03_施工写真", "04_完了報告書", "05_請求書", "06_入金資料", "07_仕様書"];
export type QnapFileType = "estimate" | "invoice" | "completion_report" | "survey_photo" | "construction_photo";
/** /TOMS/案件/{year}/{projectNo}_{customerName}_{title}/ */
export declare function generateQnapProjectCaseRoot(project: Pick<BusinessProject, "projectNo" | "customerName" | "title" | "createdAt">): string;
/** 案件ルート（Phase601+ 標準パス） */
export declare function generateQnapBusinessRoot(project: Pick<BusinessProject, "projectNo" | "customerName" | "title" | "createdAt" | "id">): string;
export declare function generateQnapProjectPath(project: Pick<BusinessProject, "id" | "projectNo" | "customerName" | "title"> & {
    createdAt?: string;
}): string;
export declare function generateQnapSubfolderPath(project: Pick<BusinessProject, "id" | "customerName">, sub: (typeof QNAP_BUSINESS_SUBFOLDERS)[number]): string;
export declare function generateQnapFilePath(project: Pick<BusinessProject, "id" | "projectNo" | "customerName" | "title"> & {
    createdAt?: string;
}, fileType: QnapFileType, docNo?: string): string;
export declare function generateQnapCaseSubfolderPath(project: Pick<BusinessProject, "projectNo" | "customerName" | "title" | "createdAt" | "id">, sub: (typeof QNAP_CASE_FOLDERS)[number]): string;
export declare function generateQnapSpecificationFolderPath(project: Pick<BusinessProject, "projectNo" | "customerName" | "title" | "createdAt" | "id">): string;
export declare function generateQnapSpecificationFilePath(project: Pick<BusinessProject, "projectNo" | "customerName" | "title" | "createdAt" | "id">): string;
export declare function createQnapSavePlan(project: BusinessProject): QnapSavePlan;
export interface QnapMockSaveResult {
    planId: string;
    basePath: string;
    savedFiles: Array<{
        label: string;
        path: string;
        localMirror?: string;
    }>;
    status: "synced";
}
export declare function mockSaveToQnap(project: BusinessProject, plan?: QnapSavePlan): QnapMockSaveResult;
